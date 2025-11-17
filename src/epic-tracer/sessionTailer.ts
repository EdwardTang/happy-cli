/**
 * SessionTailer - Watches and tails Claude session JSONL files
 *
 * Responsibilities:
 * - Watch session file for changes using fs.watch
 * - Periodically check for new lines (handles missed events)
 * - Parse and validate RawJSONLines messages
 * - Emit validated messages to EventExtractor
 * - Gracefully handle file access issues
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { RawJSONLinesSchema, type RawJSONLines } from "@/claude/types";
import { logger } from "@/ui/logger";

export interface SessionTailerConfig {
  sessionFilePath: string;
  checkIntervalMs?: number; // Default: 500ms
}

export interface SessionTailerEvents {
  message: (message: RawJSONLines) => void;
  parseError: (error: { lineNumber: number; error: string; line: string }) => void;
  error: (error: Error) => void;
  close: () => void;
}

export class SessionTailer extends EventEmitter {
  private sessionFilePath: string;
  private checkIntervalMs: number;

  // State tracking
  private processedLines: number = 0;
  private watcher: fs.FSWatcher | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private isClosing: boolean = false;

  constructor(config: SessionTailerConfig) {
    super();
    this.sessionFilePath = config.sessionFilePath;
    this.checkIntervalMs = config.checkIntervalMs ?? 500;
  }

  /**
   * Start watching the session file
   */
  async start(): Promise<void> {
    logger.debug("SessionTailer starting", {
      file: this.sessionFilePath,
      checkInterval: this.checkIntervalMs
    });

    // Verify file exists
    if (!fs.existsSync(this.sessionFilePath)) {
      const error = new Error(`Session file not found: ${this.sessionFilePath}`);
      this.emit("error", error);
      throw error;
    }

    // Process any existing lines
    await this.processNewLines();

    // Start file watcher
    try {
      this.watcher = fs.watch(this.sessionFilePath, (eventType) => {
        if (eventType === "change" && !this.isClosing) {
          this.processNewLines().catch((error) => {
            this.emit("error", error);
          });
        }
      });

      logger.debug("File watcher started", { file: this.sessionFilePath });
    } catch (error) {
      logger.warn("Failed to start file watcher, using polling only", {
        file: this.sessionFilePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Start periodic check (handles missed events)
    this.checkInterval = setInterval(() => {
      if (!this.isClosing) {
        this.processNewLines().catch((error) => {
          this.emit("error", error);
        });
      }
    }, this.checkIntervalMs);

    logger.debug("SessionTailer started successfully");
  }

  /**
   * Process new lines that have been added to the file
   */
  private async processNewLines(): Promise<void> {
    try {
      const content = fs.readFileSync(this.sessionFilePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      // Process only new lines
      const newLines = lines.slice(this.processedLines);

      for (let i = 0; i < newLines.length; i++) {
        const lineNumber = this.processedLines + i + 1;
        const line = newLines[i];

        try {
          // Parse JSON
          const parsed = JSON.parse(line);

          // Validate against schema
          const validated = RawJSONLinesSchema.parse(parsed);

          // Emit validated message
          this.emit("message", validated);
        } catch (error) {
          // Log parse error but continue processing
          const errorMessage = error instanceof Error ? error.message : String(error);

          logger.warn("Failed to parse session line", {
            lineNumber,
            error: errorMessage,
            line: line.substring(0, 100) // First 100 chars
          });

          this.emit("parseError", {
            lineNumber,
            error: errorMessage,
            line: line.substring(0, 200)
          });
        }
      }

      // Update processed line count
      this.processedLines = lines.length;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File was deleted - emit error and close
        const fileError = new Error(`Session file deleted: ${this.sessionFilePath}`);
        this.emit("error", fileError);
        await this.close();
      } else {
        throw error;
      }
    }
  }

  /**
   * Stop watching and clean up resources
   */
  async close(): Promise<void> {
    if (this.isClosing) return;

    this.isClosing = true;

    logger.debug("SessionTailer closing", { file: this.sessionFilePath });

    // Stop interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.emit("close");

    logger.debug("SessionTailer closed");
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    processedLines: number;
    sessionFile: string;
  } {
    return {
      isRunning: !this.isClosing && (this.watcher !== null || this.checkInterval !== null),
      processedLines: this.processedLines,
      sessionFile: this.sessionFilePath
    };
  }
}
