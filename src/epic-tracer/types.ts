/**
 * Type definitions for Epic Tracer
 *
 * Defines the schema for exec-log entries that track:
 * - UTC timestamps
 * - Tools used
 * - Decisions taken
 * - Blockers encountered
 * - Chain of thought
 */

import { z } from 'zod';

/**
 * Base schema for all exec-log entries
 */
const BaseExecLogEntrySchema = z.object({
    timestamp: z.string(), // ISO UTC timestamp from RawJSONLines
    sessionId: z.string(),
    epicId: z.string(),
});

/**
 * Tool usage event - logged when Claude uses a tool
 */
export const ToolUsedEntrySchema = BaseExecLogEntrySchema.extend({
    kind: z.literal('tool-used'),
    toolUseId: z.string(),
    toolName: z.string(),
    isSidechain: z.boolean(),
    parentUuid: z.string().nullable(),
    inputSummary: z.string().optional(), // Truncated/redacted input
});

/**
 * Decision event - logged when a permission decision is made
 */
export const DecisionEntrySchema = BaseExecLogEntrySchema.extend({
    kind: z.literal('decision'),
    toolUseId: z.string(),
    toolName: z.string(),
    decision: z.enum(['approved', 'denied']),
    mode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan']).optional(),
    allowTools: z.array(z.string()).optional(),
    reason: z.string().optional(),
});

/**
 * Blocker event - logged when something blocks progress
 */
export const BlockerEntrySchema = BaseExecLogEntrySchema.extend({
    kind: z.literal('blocker'),
    toolUseId: z.string().optional(), // May be session-level blocker without tool
    toolName: z.string().optional(),
    blockerType: z.enum(['permission-denied', 'interrupt', 'tool-error', 'session-crash']),
    message: z.string(),
});

/**
 * Chain of Thought event - logged to capture reasoning
 */
export const CoTEntrySchema = BaseExecLogEntrySchema.extend({
    kind: z.literal('cot'),
    scope: z.enum(['tool', 'turn', 'session']),
    toolUseId: z.string().optional(), // Present for tool-scoped CoT
    text: z.string(), // Truncated assistant text or summarized reasoning
});

/**
 * Union of all exec-log entry types
 */
export const ExecLogEntrySchema = z.discriminatedUnion('kind', [
    ToolUsedEntrySchema,
    DecisionEntrySchema,
    BlockerEntrySchema,
    CoTEntrySchema,
]);

export type ExecLogEntry = z.infer<typeof ExecLogEntrySchema>;
export type ToolUsedEntry = z.infer<typeof ToolUsedEntrySchema>;
export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;
export type BlockerEntry = z.infer<typeof BlockerEntrySchema>;
export type CoTEntry = z.infer<typeof CoTEntrySchema>;

/**
 * Tool call state tracked by the tracer
 */
export interface ToolCallState {
    id: string;
    name: string;
    timestamp: string;
    parentUuid: string | null;
    isSidechain: boolean;
    input?: unknown;
}

/**
 * Configuration for the epic tracer
 */
export interface EpicTracerConfig {
    epicId: string;
    workingDirectory: string;
    sessionId?: string; // If provided, trace this specific session. Otherwise, follow latest.
    outputDir?: string; // Override default .claude/epics/<epic>/trace/
    cotMaxLength?: number; // Max length for CoT text (default: 500)
    includeCoT?: boolean; // Whether to include CoT entries (default: true)
}
