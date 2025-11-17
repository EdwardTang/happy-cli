/**
 * Epic Tracer - Main orchestrator
 *
 * Coordinates SessionTailer, EventExtractor, and ExecLogWriter to create
 * exec-log traces of Claude Code sessions tagged with epic IDs.
 *
 * Usage:
 *   const tracer = new EpicTracer({ epicId: 'payments', workingDirectory: process.cwd() });
 *   await tracer.start();
 *   // ... tracer runs in background ...
 *   await tracer.stop();
 */

import { EventExtractor } from './eventExtractor';
import { ExecLogWriter } from './execLogWriter';
import { SessionTailer } from './sessionTailer';
import type { EpicTracerConfig } from './types';
import { logger } from '@/ui/logger';

/**
 * Epic Tracer class
 */
export class EpicTracer {
    private config: Required<EpicTracerConfig>;
    private tailer: SessionTailer | null = null;
    private extractor: EventExtractor | null = null;
    private writer: ExecLogWriter | null = null;
    private isRunning: boolean = false;

    constructor(config: EpicTracerConfig) {
        // Set defaults
        this.config = {
            ...config,
            sessionId: config.sessionId,
            outputDir: config.outputDir,
            cotMaxLength: config.cotMaxLength ?? 500,
            includeCoT: config.includeCoT ?? true,
        } as Required<EpicTracerConfig>;
    }

    /**
     * Start the epic tracer
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('[EPIC_TRACER] Already running');
            return;
        }

        logger.info(`[EPIC_TRACER] Starting tracer for epic: ${this.config.epicId}`);
        this.isRunning = true;

        // Initialize components
        this.extractor = new EventExtractor(this.config.epicId, {
            cotMaxLength: this.config.cotMaxLength,
            includeCoT: this.config.includeCoT,
        });

        this.tailer = new SessionTailer(this.config.workingDirectory, this.config.sessionId);

        // Set up event handlers
        this.tailer.on('message', async (message) => {
            await this.handleMessage(message);
        });

        this.tailer.on('error', (error) => {
            logger.warn(`[EPIC_TRACER] Tailer error: ${error}`);
        });

        // Start tailing
        try {
            await this.tailer.start();
            logger.info('[EPIC_TRACER] Tracer started successfully');
        } catch (error) {
            logger.warn(`[EPIC_TRACER] Failed to start: ${error}`);
            await this.stop();
            throw error;
        }
    }

    /**
     * Stop the epic tracer
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        logger.info('[EPIC_TRACER] Stopping tracer');
        this.isRunning = false;

        // Close tailer
        if (this.tailer) {
            await this.tailer.close();
            this.tailer = null;
        }

        // Close writer (flushes remaining entries)
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }

        this.extractor = null;

        logger.info('[EPIC_TRACER] Tracer stopped');
    }

    /**
     * Handle a new message from the tailer
     */
    private async handleMessage(message: any): Promise<void> {
        if (!this.extractor || !this.isRunning) {
            return;
        }

        // Lazy-initialize writer when we get first message
        // This ensures we have the correct sessionId
        if (!this.writer && message.sessionId) {
            this.writer = new ExecLogWriter(
                this.config.epicId,
                message.sessionId,
                this.config.outputDir
            );
            logger.info(`[EPIC_TRACER] Initialized writer for session: ${message.sessionId}`);
            logger.info(`[EPIC_TRACER] Output file: ${this.writer.getFilePath()}`);
        }

        try {
            // Extract events from message
            const events = this.extractor.extract(message);

            // Write events to exec-log
            if (events.length > 0 && this.writer) {
                await this.writer.writeMany(events);
                logger.debug(`[EPIC_TRACER] Extracted ${events.length} events`);
            }
        } catch (error) {
            logger.warn(`[EPIC_TRACER] Error processing message: ${error}`);
        }
    }

    /**
     * Get the current exec-log file path (if available)
     */
    getExecLogPath(): string | null {
        return this.writer?.getFilePath() ?? null;
    }

    /**
     * Check if tracer is running
     */
    isActive(): boolean {
        return this.isRunning;
    }
}
