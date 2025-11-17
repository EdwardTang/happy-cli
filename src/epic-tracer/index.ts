/**
 * Epic Tracer - Public API
 *
 * External tool that traces Claude Code execution logs and generates
 * epic-scoped exec-logs with UTC timestamps, tools used, decisions taken,
 * blockers encountered, and chain of thought.
 */

export { EpicTracer } from './epicTracer';
export { EventExtractor } from './eventExtractor';
export { ExecLogWriter } from './execLogWriter';
export { SessionTailer } from './sessionTailer';
export * from './types';
