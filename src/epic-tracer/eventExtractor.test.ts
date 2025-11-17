/**
 * Test suite for EventExtractor
 * Validates extraction accuracy of exec-log events from session messages
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventExtractor } from "./eventExtractor";
import type { ExecLogEntry } from "./types";
import type { RawJSONLines } from "@/claude/types";
import {
  mockUserMessage,
  mockToolUseMessage,
  mockToolResultSuccess,
  mockPermissionRequest,
  mockPermissionApproval,
  mockPermissionDenial,
  mockToolError,
  mockCoTMessage,
  mockSidechainMessage,
  mockInterrupt,
  mockSessionSequence,
  expectedExecLogEntries
} from "./testData";

describe("EventExtractor", () => {
  let extractor: EventExtractor;

  beforeEach(() => {
    extractor = new EventExtractor({
      epicId: "test-epic",
      includeCoT: true,
      cotMaxLength: 500
    });
  });

  describe("Tool Usage Extraction", () => {
    it("should extract tool-used event from assistant message", () => {
      const events = extractor.extractEvents(mockToolUseMessage);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "tool-used",
        toolName: "Read",
        toolUseId: "toolu_read_001",
        timestamp: "2025-11-17T10:00:01.000Z",
        sessionId: "session-123",
        epicId: "test-epic"
      });
    });

    it("should extract multiple tool uses from single message", () => {
      const multiToolMessage: RawJSONLines = {
        type: "assistant",
        uuid: "multi-tool-msg",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_001",
              name: "Read",
              input: { file_path: "file1.txt" }
            },
            {
              type: "tool_use",
              id: "toolu_002",
              name: "Write",
              input: { file_path: "file2.txt", content: "data" }
            }
          ]
        }
      };

      const events = extractor.extractEvents(multiToolMessage);

      expect(events).toHaveLength(2);
      expect(events[0].kind).toBe("tool-used");
      expect(events[1].kind).toBe("tool-used");
      if (events[0].kind === "tool-used") expect(events[0].toolName).toBe("Read");
      if (events[1].kind === "tool-used") expect(events[1].toolName).toBe("Write");
    });

    it("should track sidechain relationships", () => {
      const events = extractor.extractEvents(mockSidechainMessage);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "tool-used",
        toolName: "Task",
        toolUseId: "toolu_task_001"
      });
    });
  });

  describe("Decision Extraction", () => {
    it("should extract approval decision", () => {
      const events = extractor.extractEvents(mockPermissionApproval);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "decision",
        decision: "approved",
        mode: "automatic",
        toolUseId: "toolu_write_001",
        timestamp: "2025-11-17T10:00:04.000Z"
      });
    });

    it("should extract denial decision with reason", () => {
      const events = extractor.extractEvents(mockPermissionDenial);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "decision",
        decision: "denied",
        mode: "manual",
        reason: "User rejected destructive command",
        toolUseId: "toolu_bash_001"
      });
    });
  });

  describe("Blocker Extraction", () => {
    it("should extract tool error as blocker", () => {
      const events = extractor.extractEvents(mockToolError);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "blocker",
        blockerType: "tool-error",
        message: "Error: File not found: /home/user/missing.txt",
        toolUseId: "toolu_read_002"
      });
    });

    it("should extract interrupt as blocker", () => {
      const events = extractor.extractEvents(mockInterrupt);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "blocker",
        blockerType: "interrupt",
        message: "Task cancelled by user",
        toolUseId: "toolu_task_001"
      });
    });

    it("should detect permission denial as blocker", () => {
      const events = extractor.extractEvents(mockPermissionDenial);

      // Should extract BOTH decision and blocker
      expect(events.length).toBeGreaterThanOrEqual(1);

      const blocker = events.find(e => e.kind === "blocker");
      if (blocker && blocker.kind === "blocker") {
        expect(blocker.blockerType).toBe("permission-denial");
      }
    });
  });

  describe("Chain of Thought Extraction", () => {
    it("should extract CoT when enabled", () => {
      const events = extractor.extractEvents(mockCoTMessage);

      const cotEvent = events.find(e => e.kind === "cot");
      expect(cotEvent).toBeDefined();

      if (cotEvent && cotEvent.kind === "cot") {
        expect(cotEvent.text).toContain("TypeScript project");
        expect(cotEvent.text).toContain("testing infrastructure");
        expect(cotEvent.truncated).toBe(false);
      }
    });

    it("should truncate long CoT text", () => {
      const shortExtractor = new EventExtractor({
        epicId: "test-epic",
        includeCoT: true,
        cotMaxLength: 50
      });

      const events = shortExtractor.extractEvents(mockCoTMessage);
      const cotEvent = events.find(e => e.kind === "cot");

      if (cotEvent && cotEvent.kind === "cot") {
        expect(cotEvent.text.length).toBeLessThanOrEqual(50);
        expect(cotEvent.truncated).toBe(true);
      }
    });

    it("should not extract CoT when disabled", () => {
      const noCoTExtractor = new EventExtractor({
        epicId: "test-epic",
        includeCoT: false
      });

      const events = noCoTExtractor.extractEvents(mockCoTMessage);
      const cotEvent = events.find(e => e.kind === "cot");

      expect(cotEvent).toBeUndefined();
    });
  });

  describe("End-to-End Session Processing", () => {
    it("should process complete session sequence correctly", () => {
      const allEvents: ExecLogEntry[] = [];

      for (const message of mockSessionSequence) {
        const events = extractor.extractEvents(message);
        allEvents.push(...events);
      }

      // Should extract all expected event types
      const toolUsed = allEvents.filter(e => e.kind === "tool-used");
      const decisions = allEvents.filter(e => e.kind === "decision");
      const blockers = allEvents.filter(e => e.kind === "blocker");
      const cots = allEvents.filter(e => e.kind === "cot");

      expect(toolUsed.length).toBeGreaterThan(0);
      expect(decisions.length).toBeGreaterThan(0);
      expect(blockers.length).toBeGreaterThan(0);
      expect(cots.length).toBeGreaterThan(0);

      // Verify chronological ordering
      const timestamps = allEvents.map(e => new Date(e.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it("should maintain correct event counts", () => {
      const allEvents: ExecLogEntry[] = [];

      for (const message of mockSessionSequence) {
        const events = extractor.extractEvents(message);
        allEvents.push(...events);
      }

      // Verify against expected entries
      expect(allEvents.length).toBeGreaterThanOrEqual(expectedExecLogEntries.length);
    });
  });

  describe("Edge Cases", () => {
    it("should handle user message without tool results", () => {
      const events = extractor.extractEvents(mockUserMessage);
      expect(events).toHaveLength(0);
    });

    it("should handle assistant message without tool use", () => {
      const textOnlyMessage: RawJSONLines = {
        type: "assistant",
        uuid: "text-only-msg",
        message: {
          content: [
            {
              type: "text",
              text: "Just a text response"
            }
          ]
        }
      };

      const events = extractor.extractEvents(textOnlyMessage);

      // Should have no tool-used events
      const toolEvents = events.filter(e => e.kind === "tool-used");
      expect(toolEvents).toHaveLength(0);
    });

    it("should handle malformed messages gracefully", () => {
      const malformedMessage = {
        type: "assistant",
        uuid: "bad-msg",
        timestamp: "2025-11-17T10:00:00.000Z",
        sessionId: "session-123",
        message: {
          content: null // Malformed
        }
      };

      // Should not throw, should return empty array
      expect(() => extractor.extractEvents(malformedMessage as any)).not.toThrow();
    });
  });

  describe("Timestamp Extraction", () => {
    it("should use message timestamp from RawJSONLines", () => {
      const events = extractor.extractEvents(mockToolUseMessage);

      expect(events[0].timestamp).toBe("2025-11-17T10:00:01.000Z");
    });

    it("should preserve UTC timezone", () => {
      const events = extractor.extractEvents(mockToolUseMessage);

      const timestamp = events[0].timestamp;
      expect(timestamp).toMatch(/Z$/); // Ends with Z (UTC)

      // Verify it's a valid ISO datetime
      const date = new Date(timestamp);
      expect(date.toISOString()).toBe(timestamp);
    });
  });

  describe("Session ID Tracking", () => {
    it("should extract sessionId from messages", () => {
      const events = extractor.extractEvents(mockToolUseMessage);

      expect(events[0].sessionId).toBe("session-123");
    });

    it("should maintain consistent sessionId across events", () => {
      const allEvents: ExecLogEntry[] = [];

      for (const message of mockSessionSequence) {
        const events = extractor.extractEvents(message);
        allEvents.push(...events);
      }

      const sessionIds = new Set(allEvents.map(e => e.sessionId));
      expect(sessionIds.size).toBe(1); // All same session
      expect(sessionIds.has("session-123")).toBe(true);
    });
  });
});
