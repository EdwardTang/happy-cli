/**
 * EpicTracer - Main orchestrator for epic execution logging
 *
 * Responsibilities:
 * - Coordinate SessionTailer, EventExtractor, and ExecLogWriter
 * - Initialize components with proper configuration
 * - Set up event handlers and data flow
 * - Provide unified start/stop lifecycle
 * - Handle errors gracefully
 */

import type { RawJSONLines } from "@/claude/types";
import { SessionTailer } from "./sessionTailer";
import { EventExtractor } from "./eventExtractor";
import { ExecLogWriter } from "./execLogWriter";
import type { EpicTracerConfig, ExecLogEntry } from "./types";
import { logger } from "@/ui/logger";

export class EpicTracer {
  private config: EpicTracerConfig;

  // Components
  private sessionTailer: SessionTailer | null = null;
  private eventExtractor: EventExtractor;
  private execLogWriter: ExecLogWriter | null = null;

  // State
  private isRunning: boolean = false;
  private eventsProcessed: number = 0;
  private eventsWritten: number = 0;
  private parseErrors: number = 0;

  constructor(config: EpicTracerConfig) {
    this.config = config;

    // EventExtractor is stateless and can be created immediately
    this.eventExtractor = new EventExtractor({
      epicId: config.epicId,
      includeCoT: config.includeCoT ?? false,
      cotMaxLength: config.cotMaxLength ?? 500
    });

    logger.debug("EpicTracer created", { config });
  }

  /**
   * Start the epic tracer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("EpicTracer is already running");
    }

    logger.info("EpicTracer starting", {
      epicId: this.config.epicId,
      sessionId: this.config.sessionId,
      sessionFile: this.config.sessionFile
    });

    try {
      // Determine session file path
      const sessionFilePath = this.config.sessionFile ?? this.discoverSessionFile();

      // Initialize SessionTailer
      this.sessionTailer = new SessionTailer({
        sessionFilePath,
        checkIntervalMs: 500 // Check for new lines every 500ms
      });

      // Set up SessionTailer event handlers
      this.sessionTailer.on("message", this.handleMessage.bind(this));
      this.sessionTailer.on("parseError", this.handleParseError.bind(this));
      this.sessionTailer.on("error", this.handleError.bind(this));
      this.sessionTailer.on("close", () => {
        logger.debug("SessionTailer closed");
      });

      // Start SessionTailer (this will process existing lines and discover sessionId)
      await this.sessionTailer.start();

      // ExecLogWriter is lazy-initialized on first message to capture correct sessionId
      // (in case sessionId wasn't provided in config)

      this.isRunning = true;

      logger.info("EpicTracer started successfully", {
        outputFile: this.execLogWriter?.getOutputFilePath() || "pending"
      });
    } catch (error) {
      logger.warn("Failed to start EpicTracer", {
        error: error instanceof Error ? error.message : String(error)
      });

      // Cleanup on failure
      await this.cleanup();

      throw error;
    }
  }

  /**
   * Handle incoming session messages
   */
  private async handleMessage(message: RawJSONLines): Promise<void> {
    try {
      // Lazy-initialize ExecLogWriter on first message
      if (!this.execLogWriter) {
        await this.initializeWriter(message);
      }

      // Extract events from message
      const events = this.eventExtractor.extractEvents(message);

      this.eventsProcessed += events.length;

      // Write events to exec-log
      if (this.execLogWriter) {
        for (const event of events) {
          await this.execLogWriter.write(event);
          this.eventsWritten++;
        }
      }

      // Log progress periodically
      if (this.eventsProcessed % 10 === 0) {
        logger.debug("EpicTracer progress", {
          eventsProcessed: this.eventsProcessed,
          eventsWritten: this.eventsWritten,
          parseErrors: this.parseErrors
        });
      }
    } catch (error) {
      logger.warn("Failed to process message", {
        messageUuid: message.uuid,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Initialize ExecLogWriter (lazy initialization)
   */
  private async initializeWriter(firstMessage: RawJSONLines): Promise<void> {
    // Extract sessionId from message if not provided in config
    const sessionId = this.config.sessionId ?? (firstMessage as any).sessionId ?? "unknown";

    logger.debug("Initializing ExecLogWriter", { sessionId });

    this.execLogWriter = new ExecLogWriter({
      epicId: this.config.epicId,
      sessionId,
      outputDir: this.config.outputDir,
      batchSize: this.config.batchSize ?? 10,
      flushIntervalMs: this.config.flushIntervalMs ?? 1000
    });

    await this.execLogWriter.initialize();

    logger.info("ExecLogWriter initialized", {
      outputFile: this.execLogWriter.getOutputFilePath()
    });
  }

  /**
   * Handle parse errors from SessionTailer
   */
  private handleParseError(error: { lineNumber: number; error: string; line: string }): void {
    this.parseErrors++;

    logger.warn("Session line parse error", {
      lineNumber: error.lineNumber,
      error: error.error,
      line: error.line.substring(0, 100)
    });
  }

  /**
   * Handle errors from SessionTailer
   */
  private handleError(error: Error): void {
    logger.warn("SessionTailer error", {
      error: error.message
    });
  }

  /**
   * Discover session file path from config
   */
  private discoverSessionFile(): string {
    if (this.config.sessionFile) {
      return this.config.sessionFile;
    }

    // For now, require explicit session file path
    // TODO: Implement auto-discovery in Phase 2
    throw new Error(
      "Session file path is required. Provide either config.sessionFile or implement auto-discovery."
    );
  }

  /**
   * Stop the epic tracer
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info("EpicTracer stopping", {
      eventsProcessed: this.eventsProcessed,
      eventsWritten: this.eventsWritten,
      parseErrors: this.parseErrors
    });

    this.isRunning = false;

    await this.cleanup();

    logger.info("EpicTracer stopped successfully");
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Close SessionTailer
    if (this.sessionTailer) {
      await this.sessionTailer.close();
      this.sessionTailer = null;
    }

    // Close ExecLogWriter (will flush remaining entries)
    if (this.execLogWriter) {
      await this.execLogWriter.close();
      this.execLogWriter = null;
    }
  }

  /**
   * Get output file path (if writer initialized)
   */
  getOutputFilePath(): string | null {
    return this.execLogWriter?.getOutputFilePath() ?? null;
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    eventsProcessed: number;
    eventsWritten: number;
    parseErrors: number;
    outputFile: string | null;
  } {
    return {
      isRunning: this.isRunning,
      eventsProcessed: this.eventsProcessed,
      eventsWritten: this.eventsWritten,
      parseErrors: this.parseErrors,
      outputFile: this.getOutputFilePath()
    };
  }
}
