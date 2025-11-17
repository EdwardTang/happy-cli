/**
 * ExecLogWriter - Batched JSONL writer for exec-log entries
 *
 * Responsibilities:
 * - Write exec-log entries to JSONL files
 * - Batch writes for performance (queue-based)
 * - Periodic flush (default: 1 second)
 * - Ensure output directory exists
 * - Graceful error handling
 */

import fs from "fs";
import path from "path";
import type { ExecLogEntry } from "./types";
import { logger } from "@/ui/logger";

export interface ExecLogWriterConfig {
  epicId: string;
  sessionId: string;
  outputDir?: string; // Default: .claude/epics/<epicId>/trace/
  batchSize?: number; // Default: 10
  flushIntervalMs?: number; // Default: 1000
}

export class ExecLogWriter {
  private epicId: string;
  private sessionId: string;
  private outputFilePath: string;

  // Batching configuration
  private batchSize: number;
  private flushIntervalMs: number;

  // Write queue and state
  private queue: ExecLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private fileHandle: fs.promises.FileHandle | null = null;
  private isClosed: boolean = false;
  private writeCount: number = 0;

  constructor(config: ExecLogWriterConfig) {
    this.epicId = config.epicId;
    this.sessionId = config.sessionId;
    this.batchSize = config.batchSize ?? 10;
    this.flushIntervalMs = config.flushIntervalMs ?? 1000;

    // Determine output file path
    const outputDir = config.outputDir ?? path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      ".claude",
      "epics",
      this.epicId,
      "trace"
    );

    this.outputFilePath = path.join(outputDir, `exec-log-${this.sessionId}.jsonl`);

    logger.debug("ExecLogWriter created", {
      epicId: this.epicId,
      sessionId: this.sessionId,
      outputFile: this.outputFilePath,
      batchSize: this.batchSize,
      flushInterval: this.flushIntervalMs
    });
  }

  /**
   * Initialize the writer (ensure directory exists, open file)
   */
  async initialize(): Promise<void> {
    if (this.isClosed) {
      throw new Error("ExecLogWriter is closed");
    }

    // Ensure output directory exists
    const outputDir = path.dirname(this.outputFilePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      logger.debug("Created output directory", { dir: outputDir });
    }

    // Open file for appending
    try {
      this.fileHandle = await fs.promises.open(this.outputFilePath, "a");
      logger.debug("Opened exec-log file", { path: this.outputFilePath });
    } catch (error) {
      logger.warn("Failed to open exec-log file", {
        path: this.outputFilePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    // Start periodic flush
    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => {
        logger.warn("Periodic flush failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }, this.flushIntervalMs);

    logger.debug("ExecLogWriter initialized");
  }

  /**
   * Write an exec-log entry (adds to queue, flushes if batch size reached)
   */
  async write(entry: ExecLogEntry): Promise<void> {
    if (this.isClosed) {
      throw new Error("ExecLogWriter is closed");
    }

    if (!this.fileHandle) {
      throw new Error("ExecLogWriter not initialized - call initialize() first");
    }

    // Add to queue
    this.queue.push(entry);

    // Flush if batch size reached
    if (this.queue.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush all queued entries to disk
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0 || !this.fileHandle) {
      return;
    }

    const entriesToWrite = [...this.queue];
    this.queue = [];

    try {
      // Convert entries to JSONL format
      const lines = entriesToWrite.map((entry) => JSON.stringify(entry)).join("\n") + "\n";

      // Write to file
      await this.fileHandle.write(lines);

      this.writeCount += entriesToWrite.length;

      logger.debug("Flushed exec-log entries", {
        count: entriesToWrite.length,
        totalWritten: this.writeCount
      });
    } catch (error) {
      // Re-queue entries on error
      this.queue.unshift(...entriesToWrite);

      logger.warn("Failed to flush exec-log entries", {
        count: entriesToWrite.length,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Close the writer and flush remaining entries
   */
  async close(): Promise<void> {
    if (this.isClosed) return;

    logger.debug("ExecLogWriter closing", {
      queuedEntries: this.queue.length,
      totalWritten: this.writeCount
    });

    this.isClosed = true;

    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    if (this.queue.length > 0) {
      try {
        await this.flush();
      } catch (error) {
        logger.warn("Final flush failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Close file handle
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }

    logger.debug("ExecLogWriter closed", {
      totalWritten: this.writeCount,
      outputFile: this.outputFilePath
    });
  }

  /**
   * Get output file path
   */
  getOutputFilePath(): string {
    return this.outputFilePath;
  }

  /**
   * Get current status
   */
  getStatus(): {
    isOpen: boolean;
    queuedEntries: number;
    totalWritten: number;
    outputFile: string;
  } {
    return {
      isOpen: !this.isClosed && this.fileHandle !== null,
      queuedEntries: this.queue.length,
      totalWritten: this.writeCount,
      outputFile: this.outputFilePath
    };
  }
}
