/**
 * Type definitions and Zod schemas for epic tracer exec-log entries
 */

import { z } from "zod";

// ============================================================================
// Exec-Log Entry Schemas
// ============================================================================

/**
 * Base schema for all exec-log entries
 */
const BaseEntrySchema = z.object({
  timestamp: z.string().datetime(), // ISO UTC timestamp
  sessionId: z.string().uuid(),
  epicId: z.string(),
  toolUseId: z.string().optional(), // Present for tool-related events
});

/**
 * Tool usage event - when a tool is invoked
 */
export const ToolUsedEntrySchema = BaseEntrySchema.extend({
  kind: z.literal("tool-used"),
  toolName: z.string(), // e.g., "Bash", "Read", "Write"
  toolInput: z.record(z.any()).optional(), // Optional: tool parameters
  parentToolUseId: z.string().optional(), // For sidechain tracking
});

/**
 * Decision event - permission approval/denial
 */
export const DecisionEntrySchema = BaseEntrySchema.extend({
  kind: z.literal("decision"),
  decision: z.enum(["approved", "denied"]),
  mode: z.enum(["automatic", "manual"]), // Auto vs user decision
  reason: z.string().optional(), // Optional explanation
});

/**
 * Blocker event - execution blocked/interrupted
 */
export const BlockerEntrySchema = BaseEntrySchema.extend({
  kind: z.literal("blocker"),
  blockerType: z.enum([
    "permission-denial",
    "tool-error",
    "interrupt",
    "timeout",
    "unknown"
  ]),
  message: z.string(), // Error/blocker message
  toolName: z.string().optional(), // Tool that caused blocker
});

/**
 * Chain of thought event - assistant reasoning
 */
export const CoTEntrySchema = BaseEntrySchema.extend({
  kind: z.literal("cot"),
  text: z.string(), // Extracted reasoning text
  truncated: z.boolean().default(false), // If text was truncated
});

/**
 * Discriminated union of all exec-log entry types
 */
export const ExecLogEntrySchema = z.discriminatedUnion("kind", [
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

// ============================================================================
// Tool Call State Tracking
// ============================================================================

/**
 * Tracks active tool calls for sidechain relationship mapping
 */
export interface ToolCallState {
  toolUseId: string;
  toolName: string;
  timestamp: string;
  parentToolUseId?: string; // For nested tool calls
  completed: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

export interface EpicTracerConfig {
  epicId: string;
  sessionId?: string; // Optional: discovered from session file if not provided
  outputDir?: string; // Optional: defaults to .claude/epics/<epicId>/trace/
  sessionFile?: string; // Optional: path to session JSONL file
  includeCoT?: boolean; // Optional: capture chain of thought (default: false)
  cotMaxLength?: number; // Optional: max CoT text length (default: 500)
  batchSize?: number; // Optional: batch size for writes (default: 10)
  flushIntervalMs?: number; // Optional: flush interval (default: 1000)
}
