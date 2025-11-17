/**
 * Session Tailer for Epic Tracer
 *
 * Watches and tails session JSONL files, emitting new RawJSONLines messages
 * as they are written to disk.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { RawJSONLines, RawJSONLinesSchema } from '@/claude/types';
import { getProjectPath } from '@/claude/utils/path';
import { startFileWatcher } from '@/modules/watcher/startFileWatcher';
import { logger } from '@/ui/logger';

/**
 * Events emitted by SessionTailer
 */
export interface SessionTailerEvents {
    message: (message: RawJSONLines) => void;
    error: (error: Error) => void;
}

/**
 * Session Tailer class
 * Extends EventEmitter to emit 'message' and 'error' events
 */
export class SessionTailer extends EventEmitter {
    private workingDirectory: string;
    private sessionId: string | null;
    private projectDir: string;
    private sessionFile: string | null = null;
    private processedCount: number = 0;
    private fileWatcher: (() => void) | null = null;
    private checkInterval: NodeJS.Timeout | null = null;
    private isClosed: boolean = false;

    constructor(workingDirectory: string, sessionId?: string) {
        super();
        this.workingDirectory = workingDirectory;
        this.sessionId = sessionId || null;
        this.projectDir = getProjectPath(workingDirectory);
    }

    /**
     * Start tailing the session file
     */
    async start(): Promise<void> {
        if (this.sessionId) {
            // Tail specific session
            await this.tailSession(this.sessionId);
        } else {
            // Follow latest session
            await this.followLatestSession();
        }
    }

    /**
     * Tail a specific session file
     */
    private async tailSession(sessionId: string): Promise<void> {
        this.sessionFile = join(this.projectDir, `${sessionId}.jsonl`);
        logger.debug(`[SESSION_TAILER] Tailing session file: ${this.sessionFile}`);

        // Read existing messages
        await this.readNewMessages();

        // Set up file watcher
        this.fileWatcher = startFileWatcher(this.sessionFile, async () => {
            if (!this.isClosed) {
                await this.readNewMessages();
            }
        });

        // Set up periodic check (in case watcher misses updates)
        this.checkInterval = setInterval(async () => {
            if (!this.isClosed) {
                await this.readNewMessages();
            }
        }, 3000);
    }

    /**
     * Follow the latest session in the project directory
     * This mimics sessionScanner behavior of tracking the newest session
     */
    private async followLatestSession(): Promise<void> {
        logger.debug(`[SESSION_TAILER] Following latest session in: ${this.projectDir}`);

        // TODO: Implement logic to find and follow latest session
        // For now, we require explicit session ID
        throw new Error('Following latest session not yet implemented. Please provide explicit sessionId.');
    }

    /**
     * Read new messages from the session file since last read
     */
    private async readNewMessages(): Promise<void> {
        if (!this.sessionFile || this.isClosed) {
            return;
        }

        try {
            // Check if file exists
            try {
                await stat(this.sessionFile);
            } catch {
                // File doesn't exist yet, wait for it
                return;
            }

            // Read file
            const content = await readFile(this.sessionFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim() !== '');

            // Process new lines only
            if (lines.length > this.processedCount) {
                const newLines = lines.slice(this.processedCount);
                this.processedCount = lines.length;

                for (const line of newLines) {
                    try {
                        const parsed = JSON.parse(line);
                        const validated = RawJSONLinesSchema.safeParse(parsed);

                        if (validated.success) {
                            this.emit('message', validated.data);
                        } else {
                            logger.debug(`[SESSION_TAILER] Invalid message format: ${validated.error}`);
                        }
                    } catch (err) {
                        logger.debug(`[SESSION_TAILER] Error parsing line: ${err}`);
                    }
                }
            }
        } catch (error) {
            logger.warn(`[SESSION_TAILER] Error reading session file: ${error}`);
            this.emit('error', error as Error);
        }
    }

    /**
     * Close the tailer and clean up resources
     */
    async close(): Promise<void> {
        this.isClosed = true;

        // Stop file watcher
        if (this.fileWatcher) {
            this.fileWatcher();
            this.fileWatcher = null;
        }

        // Stop periodic check
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        // Remove all listeners
        this.removeAllListeners();
    }
}
