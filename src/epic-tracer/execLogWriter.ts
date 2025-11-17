/**
 * Exec Log Writer for Epic Tracer
 *
 * Handles writing exec-log entries to JSONL files in the epics directory.
 * Format: .claude/epics/<epic>/trace/exec-log-<session-id>.jsonl
 */

import { mkdir, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ExecLogEntry } from './types';
import { logger } from '@/ui/logger';

/**
 * Exec Log Writer class
 */
export class ExecLogWriter {
    private epicId: string;
    private sessionId: string;
    private filePath: string;
    private writeQueue: ExecLogEntry[] = [];
    private isWriting: boolean = false;
    private flushInterval: NodeJS.Timeout | null = null;

    constructor(epicId: string, sessionId: string, outputDir?: string) {
        this.epicId = epicId;
        this.sessionId = sessionId;

        // Determine output directory
        if (outputDir) {
            this.filePath = join(outputDir, `exec-log-${sessionId}.jsonl`);
        } else {
            const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
            const epicTraceDir = join(claudeConfigDir, 'epics', epicId, 'trace');
            this.filePath = join(epicTraceDir, `exec-log-${sessionId}.jsonl`);
        }

        // Start periodic flush
        this.flushInterval = setInterval(() => {
            this.flush().catch(err => {
                logger.warn(`[EXEC_LOG_WRITER] Error flushing: ${err}`);
            });
        }, 1000); // Flush every second
    }

    /**
     * Write an exec-log entry (queues for batch writing)
     */
    async write(entry: ExecLogEntry): Promise<void> {
        this.writeQueue.push(entry);

        // If queue gets large, flush immediately
        if (this.writeQueue.length >= 10) {
            await this.flush();
        }
    }

    /**
     * Write multiple exec-log entries
     */
    async writeMany(entries: ExecLogEntry[]): Promise<void> {
        this.writeQueue.push(...entries);

        // If queue gets large, flush immediately
        if (this.writeQueue.length >= 10) {
            await this.flush();
        }
    }

    /**
     * Flush queued entries to disk
     */
    async flush(): Promise<void> {
        // Skip if already writing or nothing to write
        if (this.isWriting || this.writeQueue.length === 0) {
            return;
        }

        this.isWriting = true;

        try {
            // Ensure directory exists
            await mkdir(dirname(this.filePath), { recursive: true });

            // Take all queued entries
            const entries = [...this.writeQueue];
            this.writeQueue = [];

            // Convert to JSONL
            const lines = entries.map(entry => JSON.stringify(entry)).join('\n');

            // Append to file
            await appendFile(this.filePath, lines + '\n', 'utf-8');

            logger.debug(`[EXEC_LOG_WRITER] Wrote ${entries.length} entries to ${this.filePath}`);
        } catch (error) {
            logger.warn(`[EXEC_LOG_WRITER] Error writing to ${this.filePath}: ${error}`);
            // Put entries back in queue for retry
            this.writeQueue.unshift(...this.writeQueue);
        } finally {
            this.isWriting = false;
        }
    }

    /**
     * Close writer and flush remaining entries
     */
    async close(): Promise<void> {
        // Stop periodic flush
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }

        // Final flush
        await this.flush();
    }

    /**
     * Get the output file path
     */
    getFilePath(): string {
        return this.filePath;
    }
}
