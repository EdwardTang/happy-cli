/**
 * Epic Tracer - Public API
 *
 * Exports all public components and types for epic execution logging
 */

// Main orchestrator
export { EpicTracer } from "./epicTracer";

// Core components
export { EventExtractor } from "./eventExtractor";
export { ExecLogWriter } from "./execLogWriter";
export { SessionTailer } from "./sessionTailer";

// Types
export type {
  // Config types
  EpicTracerConfig,
  ToolCallState,

  // Entry types
  ExecLogEntry,
  ToolUsedEntry,
  DecisionEntry,
  BlockerEntry,
  CoTEntry
} from "./types";

// Schemas (for validation)
export {
  ExecLogEntrySchema,
  ToolUsedEntrySchema,
  DecisionEntrySchema,
  BlockerEntrySchema,
  CoTEntrySchema
} from "./types";
