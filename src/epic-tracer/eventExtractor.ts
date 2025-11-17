/**
 * EventExtractor - Extracts exec-log events from Claude session messages
 *
 * Responsibilities:
 * - Parse RawJSONLines messages into exec-log events
 * - Extract tool usage, decisions, blockers, and chain-of-thought
 * - Maintain tool call state for sidechain tracking
 * - Handle edge cases and malformed data gracefully
 */

import type { RawJSONLines } from "@/claude/types";
import type {
  ExecLogEntry,
  ToolUsedEntry,
  DecisionEntry,
  BlockerEntry,
  CoTEntry,
  ToolCallState,
  EpicTracerConfig
} from "./types";
import { logger } from "@/ui/logger";

export class EventExtractor {
  private epicId: string;
  private includeCoT: boolean;
  private cotMaxLength: number;

  // State tracking for sidechain relationships
  private activeToolCalls: Map<string, ToolCallState> = new Map();
  private uuidToToolMap: Map<string, string> = new Map(); // uuid -> toolUseId

  // Buffer for accumulating assistant text (for CoT)
  private assistantTextBuffer: string = "";

  constructor(config: Pick<EpicTracerConfig, "epicId" | "includeCoT" | "cotMaxLength">) {
    this.epicId = config.epicId;
    this.includeCoT = config.includeCoT ?? false;
    this.cotMaxLength = config.cotMaxLength ?? 500;
  }

  /**
   * Extract exec-log events from a session message
   */
  extractEvents(message: RawJSONLines): ExecLogEntry[] {
    const events: ExecLogEntry[] = [];

    try {
      // Extract based on message type
      switch (message.type) {
        case "assistant":
          events.push(...this.extractAssistantEvents(message));
          break;
        case "user":
          events.push(...this.extractUserEvents(message));
          break;
        case "summary":
        case "system":
          // No events to extract from summary/system messages
          break;
      }
    } catch (error) {
      logger.warn("Failed to extract events from message", {
        messageUuid: message.uuid,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return events;
  }

  /**
   * Extract events from assistant messages (tool usage, CoT)
   */
  private extractAssistantEvents(message: RawJSONLines & { type: "assistant" }): ExecLogEntry[] {
    const events: ExecLogEntry[] = [];

    if (!message.message?.content || !Array.isArray(message.message.content)) {
      return events;
    }

    // Reset text buffer for this message
    this.assistantTextBuffer = "";

    for (const content of message.message.content) {
      // Extract tool usage
      if (this.isToolUse(content)) {
        const toolEvent = this.createToolUsedEvent(message, content);
        events.push(toolEvent);

        // Track active tool call for sidechain linking
        this.activeToolCalls.set(content.id, {
          toolUseId: content.id,
          toolName: content.name,
          timestamp: (message as any).timestamp || new Date().toISOString(),
          completed: false
        });

        // Map UUID to tool for parent linking
        this.uuidToToolMap.set(message.uuid, content.id);
      }

      // Accumulate text for CoT extraction
      if (this.isTextContent(content) && this.includeCoT) {
        this.assistantTextBuffer += content.text + " ";
      }
    }

    // Extract chain of thought if we accumulated text
    if (this.assistantTextBuffer.trim() && this.includeCoT) {
      const cotEvent = this.createCoTEvent(message, this.assistantTextBuffer.trim());
      events.push(cotEvent);
    }

    return events;
  }

  /**
   * Extract events from user messages (decisions, blockers)
   */
  private extractUserEvents(message: RawJSONLines & { type: "user" }): ExecLogEntry[] {
    const events: ExecLogEntry[] = [];

    if (!message.message?.content || !Array.isArray(message.message.content)) {
      return events;
    }

    for (const content of message.message.content) {
      if (!this.isToolResult(content)) {
        continue;
      }

      const toolUseId = content.tool_use_id;

      // Extract permission decision if present
      if (content.permission) {
        const decisionEvent = this.createDecisionEvent(message, content);
        events.push(decisionEvent);

        // Permission denial is also a blocker
        if (content.permission.decision === "denied") {
          const blockerEvent = this.createBlockerEvent(message, content, "permission-denial");
          events.push(blockerEvent);
        }
      }

      // Extract error/blocker if present
      if (content.is_error || content.error) {
        const blockerType = this.inferBlockerType(content);
        const blockerEvent = this.createBlockerEvent(message, content, blockerType);
        events.push(blockerEvent);
      }

      // Mark tool call as completed
      if (this.activeToolCalls.has(toolUseId)) {
        const toolCall = this.activeToolCalls.get(toolUseId)!;
        toolCall.completed = true;
      }
    }

    return events;
  }

  /**
   * Create a tool-used event
   */
  private createToolUsedEvent(
    message: RawJSONLines & { type: "assistant" },
    toolUse: any
  ): ToolUsedEntry {
    // Determine parent tool if this is a sidechain
    let parentToolUseId: string | undefined;
    const msg = message as any;

    if (msg.isSidechain && msg.parentUuid) {
      parentToolUseId = this.uuidToToolMap.get(msg.parentUuid);
    }

    return {
      kind: "tool-used",
      timestamp: msg.timestamp || new Date().toISOString(),
      sessionId: msg.sessionId || "unknown",
      epicId: this.epicId,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      toolInput: toolUse.input,
      parentToolUseId
    };
  }

  /**
   * Create a decision event (permission approval/denial)
   */
  private createDecisionEvent(
    message: RawJSONLines & { type: "user" },
    toolResult: any
  ): DecisionEntry {
    const msg = message as any;
    return {
      kind: "decision",
      timestamp: msg.timestamp || new Date().toISOString(),
      sessionId: msg.sessionId || "unknown",
      epicId: this.epicId,
      toolUseId: toolResult.tool_use_id,
      decision: toolResult.permission.decision,
      mode: toolResult.permission.mode,
      reason: toolResult.permission.reason
    };
  }

  /**
   * Create a blocker event (error, interrupt, denial)
   */
  private createBlockerEvent(
    message: RawJSONLines & { type: "user" },
    toolResult: any,
    blockerType: BlockerEntry["blockerType"]
  ): BlockerEntry {
    // Extract error message
    let errorMessage: string;

    if (toolResult.error?.message) {
      errorMessage = toolResult.error.message;
    } else if (typeof toolResult.content === "string") {
      errorMessage = toolResult.content;
    } else if (toolResult.permission?.reason) {
      errorMessage = toolResult.permission.reason;
    } else {
      errorMessage = "Unknown error";
    }

    // Get tool name from active calls
    const toolCall = this.activeToolCalls.get(toolResult.tool_use_id);
    const msg = message as any;

    return {
      kind: "blocker",
      timestamp: msg.timestamp || new Date().toISOString(),
      sessionId: msg.sessionId || "unknown",
      epicId: this.epicId,
      toolUseId: toolResult.tool_use_id,
      blockerType,
      message: errorMessage,
      toolName: toolCall?.toolName
    };
  }

  /**
   * Create a chain-of-thought event
   */
  private createCoTEvent(
    message: RawJSONLines & { type: "assistant" },
    text: string
  ): CoTEntry {
    let truncated = false;
    let finalText = text;

    if (text.length > this.cotMaxLength) {
      finalText = text.substring(0, this.cotMaxLength);
      truncated = true;
    }

    const msg = message as any;
    return {
      kind: "cot",
      timestamp: msg.timestamp || new Date().toISOString(),
      sessionId: msg.sessionId || "unknown",
      epicId: this.epicId,
      text: finalText,
      truncated
    };
  }

  /**
   * Infer blocker type from tool result
   */
  private inferBlockerType(toolResult: any): BlockerEntry["blockerType"] {
    if (toolResult.error?.type === "interrupt") {
      return "interrupt";
    }
    if (toolResult.error?.type === "timeout") {
      return "timeout";
    }
    if (toolResult.is_error) {
      return "tool-error";
    }
    return "unknown";
  }

  /**
   * Type guard for tool_use content
   */
  private isToolUse(content: any): content is { type: "tool_use"; id: string; name: string; input: any } {
    return content?.type === "tool_use" && typeof content.id === "string" && typeof content.name === "string";
  }

  /**
   * Type guard for text content
   */
  private isTextContent(content: any): content is { type: "text"; text: string } {
    return content?.type === "text" && typeof content.text === "string";
  }

  /**
   * Type guard for tool_result content
   */
  private isToolResult(content: any): content is {
    type: "tool_result";
    tool_use_id: string;
    content: any;
    permission?: any;
    is_error?: boolean;
    error?: any;
  } {
    return content?.type === "tool_result" && typeof content.tool_use_id === "string";
  }

  /**
   * Clear internal state (useful for testing)
   */
  reset(): void {
    this.activeToolCalls.clear();
    this.uuidToToolMap.clear();
    this.assistantTextBuffer = "";
  }
}
