/**
 * Event Extractor for Epic Tracer
 *
 * Extracts exec-log events from RawJSONLines session logs:
 * - Tool usage from assistant messages
 * - Decisions from user messages with tool results
 * - Blockers from denied/interrupted/errored tools
 * - Chain of thought from assistant text messages
 */

import type { RawJSONLines } from '@/claude/types';
import type {
    ExecLogEntry,
    ToolUsedEntry,
    DecisionEntry,
    BlockerEntry,
    CoTEntry,
    ToolCallState,
} from './types';

/**
 * State maintained by the event extractor
 */
interface ExtractorState {
    epicId: string;
    toolCalls: Map<string, ToolCallState>; // toolUseId -> state
    recentAssistantText: string[]; // Buffer of recent assistant text for CoT
    cotMaxLength: number;
    includeCoT: boolean;
}

/**
 * Helper to extract sessionId from message
 */
function getSessionId(message: RawJSONLines): string {
    const msg = message as any;
    if (msg && typeof msg.sessionId === 'string') {
        return msg.sessionId;
    }
    return 'unknown';
}

/**
 * Event Extractor class
 */
export class EventExtractor {
    private state: ExtractorState;

    constructor(epicId: string, options?: { cotMaxLength?: number; includeCoT?: boolean }) {
        this.state = {
            epicId,
            toolCalls: new Map(),
            recentAssistantText: [],
            cotMaxLength: options?.cotMaxLength ?? 500,
            includeCoT: options?.includeCoT ?? true,
        };
    }

    /**
     * Extract events from a RawJSONLines message
     * Returns an array of exec-log entries (may be empty or contain multiple entries)
     */
    extract(message: RawJSONLines): ExecLogEntry[] {
        const events: ExecLogEntry[] = [];

        switch (message.type) {
            case 'assistant':
                events.push(...this.extractFromAssistant(message));
                break;
            case 'user':
                events.push(...this.extractFromUser(message));
                break;
            case 'system':
            case 'summary':
                // No events from system/summary messages
                break;
        }

        return events;
    }

    /**
     * Extract events from assistant messages
     * - Tool usage events
     * - CoT from text blocks
     */
    private extractFromAssistant(message: RawJSONLines & { type: 'assistant' }): ExecLogEntry[] {
        const events: ExecLogEntry[] = [];

        if (!message.message?.content || !Array.isArray(message.message.content)) {
            return events;
        }

        for (const block of message.message.content) {
            // Extract tool usage
            if (block.type === 'tool_use' && block.id && block.name) {
                const msg = message as any;
                const toolState: ToolCallState = {
                    id: block.id,
                    name: block.name,
                    timestamp: (msg.timestamp as string) || new Date().toISOString(),
                    parentUuid: (msg.parentUuid as string | null) ?? null,
                    isSidechain: (msg.isSidechain as boolean) ?? false,
                    input: block.input,
                };
                this.state.toolCalls.set(block.id, toolState);

                const toolEvent: ToolUsedEntry = {
                    kind: 'tool-used',
                    timestamp: toolState.timestamp,
                    sessionId: getSessionId(message),
                    epicId: this.state.epicId,
                    toolUseId: block.id,
                    toolName: block.name,
                    isSidechain: toolState.isSidechain,
                    parentUuid: toolState.parentUuid,
                    inputSummary: this.summarizeInput(block.input),
                };
                events.push(toolEvent);

                // Add CoT for this tool if we have buffered text
                if (this.state.includeCoT && this.state.recentAssistantText.length > 0) {
                    const cotText = this.state.recentAssistantText.join(' ').trim();
                    if (cotText) {
                        const cotEvent: CoTEntry = {
                            kind: 'cot',
                            timestamp: toolState.timestamp,
                            sessionId: getSessionId(message),
                            epicId: this.state.epicId,
                            scope: 'tool',
                            toolUseId: block.id,
                            text: this.truncate(cotText, this.state.cotMaxLength),
                        };
                        events.push(cotEvent);
                    }
                    // Clear buffer after using it
                    this.state.recentAssistantText = [];
                }
            }

            // Buffer text blocks for CoT
            if (block.type === 'text' && typeof block.text === 'string') {
                this.state.recentAssistantText.push(block.text);
                // Keep only last 5 text blocks to avoid unbounded growth
                if (this.state.recentAssistantText.length > 5) {
                    this.state.recentAssistantText.shift();
                }
            }
        }

        return events;
    }

    /**
     * Extract events from user messages
     * - Decisions from tool results with permissions
     * - Blockers from denied/interrupted/errored tools
     */
    private extractFromUser(message: RawJSONLines & { type: 'user' }): ExecLogEntry[] {
        const events: ExecLogEntry[] = [];

        if (!message.message?.content) {
            return events;
        }

        // Handle string content (no tool results)
        if (typeof message.message.content === 'string') {
            return events;
        }

        // Handle array content (tool results)
        if (!Array.isArray(message.message.content)) {
            return events;
        }

        for (const block of message.message.content) {
            if (block.type !== 'tool_result' || !block.tool_use_id) {
                continue;
            }

            const toolUseId = block.tool_use_id;
            const toolState = this.state.toolCalls.get(toolUseId);
            const toolName = toolState?.name ?? 'unknown';
            const msg = message as any;
            const timestamp = (msg.timestamp as string) || new Date().toISOString();

            // Extract decision if permissions field exists
            const permissions = (block as any).permissions;
            if (permissions && permissions.result) {
                const decisionEvent: DecisionEntry = {
                    kind: 'decision',
                    timestamp,
                    sessionId: getSessionId(message),
                    epicId: this.state.epicId,
                    toolUseId,
                    toolName,
                    decision: permissions.result === 'approved' ? 'approved' : 'denied',
                    mode: permissions.mode,
                    allowTools: permissions.allowedTools,
                    reason: this.extractReason(block, (message as any).toolUseResult),
                };
                events.push(decisionEvent);

                // If denied, also add a blocker
                if (permissions.result !== 'approved') {
                    const blockerEvent: BlockerEntry = {
                        kind: 'blocker',
                        timestamp,
                        sessionId: getSessionId(message),
                        epicId: this.state.epicId,
                        toolUseId,
                        toolName,
                        blockerType: 'permission-denied',
                        message: decisionEvent.reason || 'Permission denied by user',
                    };
                    events.push(blockerEvent);
                }
            }

            // Check for interruptions (canonical interrupted tool message)
            const isError = (block as any).is_error === true;
            const content = typeof block.content === 'string' ? block.content : '';
            const toolUseResult = (message as any).toolUseResult || '';

            if (isError && (content.includes('interrupted by user') || toolUseResult.includes('interrupted by user'))) {
                const blockerEvent: BlockerEntry = {
                    kind: 'blocker',
                    timestamp,
                    sessionId: getSessionId(message),
                    epicId: this.state.epicId,
                    toolUseId,
                    toolName,
                    blockerType: 'interrupt',
                    message: 'Request interrupted by user for tool use',
                };
                events.push(blockerEvent);
            }
            // Check for other tool errors
            else if (isError) {
                const errorMessage = this.extractErrorMessage(content, toolUseResult);
                const blockerEvent: BlockerEntry = {
                    kind: 'blocker',
                    timestamp,
                    sessionId: getSessionId(message),
                    epicId: this.state.epicId,
                    toolUseId,
                    toolName,
                    blockerType: 'tool-error',
                    message: errorMessage,
                };
                events.push(blockerEvent);
            }
        }

        return events;
    }

    /**
     * Summarize tool input for logging
     * Truncates large inputs to keep exec-log compact
     */
    private summarizeInput(input: unknown): string {
        if (input === null || input === undefined) {
            return '';
        }

        try {
            const str = typeof input === 'string' ? input : JSON.stringify(input);
            return this.truncate(str, 200);
        } catch {
            return '[unable to serialize]';
        }
    }

    /**
     * Extract reason from tool result
     */
    private extractReason(block: any, toolUseResult?: string): string | undefined {
        // Try to get reason from content
        if (typeof block.content === 'string' && block.content) {
            return this.truncate(block.content, 200);
        }

        // Try toolUseResult
        if (toolUseResult) {
            return this.truncate(toolUseResult, 200);
        }

        return undefined;
    }

    /**
     * Extract error message from tool result
     */
    private extractErrorMessage(content: string, toolUseResult?: string): string {
        // Prefer toolUseResult as it's usually cleaner
        if (toolUseResult) {
            return this.truncate(toolUseResult, 300);
        }

        // Fall back to content
        if (content) {
            return this.truncate(content, 300);
        }

        return 'Tool execution failed';
    }

    /**
     * Truncate string to max length with ellipsis
     */
    private truncate(str: string, maxLength: number): string {
        if (str.length <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength - 3) + '...';
    }
}
