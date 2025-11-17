/**
 * Mock session data for testing epic tracer components
 */

import type { RawJSONLines } from "@/claude/types";

/**
 * Sample user message initiating a task
 */
export const mockUserMessage: RawJSONLines = {
  type: "user",
  uuid: "user-msg-001",
  timestamp: "2025-11-17T10:00:00.000Z",
  sessionId: "session-123",
  message: {
    role: "user",
    content: "Please read the README file and summarize it"
  }
};

/**
 * Sample assistant message with tool use (Read)
 */
export const mockToolUseMessage: RawJSONLines = {
  type: "assistant",
  uuid: "asst-msg-001",
  timestamp: "2025-11-17T10:00:01.000Z",
  sessionId: "session-123",
  message: {
    model: "claude-sonnet-4-5-20250929",
    id: "msg_001",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "I'll read the README file for you."
      },
      {
        type: "tool_use",
        id: "toolu_read_001",
        name: "Read",
        input: {
          file_path: "/home/user/project/README.md"
        }
      }
    ],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50
    }
  }
};

/**
 * Sample user message with tool result (successful)
 */
export const mockToolResultSuccess: RawJSONLines = {
  type: "user",
  uuid: "user-msg-002",
  timestamp: "2025-11-17T10:00:02.000Z",
  sessionId: "session-123",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_read_001",
        content: "# My Project\n\nThis is a sample README..."
      }
    ]
  }
};

/**
 * Sample assistant message with permission request
 */
export const mockPermissionRequest: RawJSONLines = {
  type: "assistant",
  uuid: "asst-msg-002",
  timestamp: "2025-11-17T10:00:03.000Z",
  sessionId: "session-123",
  message: {
    model: "claude-sonnet-4-5-20250929",
    id: "msg_002",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "I need to write a new file. Requesting permission..."
      },
      {
        type: "tool_use",
        id: "toolu_write_001",
        name: "Write",
        input: {
          file_path: "/home/user/project/summary.md",
          content: "# Summary\n\nREADME summary here..."
        }
      }
    ],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 200,
      output_tokens: 100
    }
  }
};

/**
 * Sample permission approval (automatic)
 */
export const mockPermissionApproval: RawJSONLines = {
  type: "user",
  uuid: "user-msg-003",
  timestamp: "2025-11-17T10:00:04.000Z",
  sessionId: "session-123",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_write_001",
        permission: {
          decision: "approved",
          mode: "automatic"
        },
        content: "File written successfully"
      }
    ]
  }
};

/**
 * Sample permission denial (manual)
 */
export const mockPermissionDenial: RawJSONLines = {
  type: "user",
  uuid: "user-msg-004",
  timestamp: "2025-11-17T10:00:05.000Z",
  sessionId: "session-123",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_bash_001",
        permission: {
          decision: "denied",
          mode: "manual",
          reason: "User rejected destructive command"
        },
        content: null
      }
    ]
  }
};

/**
 * Sample tool error (blocker)
 */
export const mockToolError: RawJSONLines = {
  type: "user",
  uuid: "user-msg-005",
  timestamp: "2025-11-17T10:00:06.000Z",
  sessionId: "session-123",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_read_002",
        is_error: true,
        content: "Error: File not found: /home/user/missing.txt"
      }
    ]
  }
};

/**
 * Sample assistant with chain of thought
 */
export const mockCoTMessage: RawJSONLines = {
  type: "assistant",
  uuid: "asst-msg-003",
  timestamp: "2025-11-17T10:00:07.000Z",
  sessionId: "session-123",
  message: {
    model: "claude-sonnet-4-5-20250929",
    id: "msg_003",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Based on the README content, I can see this is a TypeScript project with testing infrastructure. The project uses Vitest for testing and has a clear structure with src/ and tests/ directories. I should now check the package.json to understand the dependencies better."
      },
      {
        type: "tool_use",
        id: "toolu_read_003",
        name: "Read",
        input: {
          file_path: "/home/user/project/package.json"
        }
      }
    ],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 300,
      output_tokens: 150
    }
  }
};

/**
 * Sample sidechain message (nested tool call)
 */
export const mockSidechainMessage: RawJSONLines = {
  type: "assistant",
  uuid: "asst-msg-004",
  timestamp: "2025-11-17T10:00:08.000Z",
  sessionId: "session-123",
  isSidechain: true,
  message: {
    model: "claude-sonnet-4-5-20250929",
    id: "msg_004",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "toolu_task_001",
        name: "Task",
        input: {
          subagent_type: "code-reviewer",
          prompt: "Review the changes in summary.md",
          description: "Code review task"
        }
      }
    ],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 150,
      output_tokens: 75
    }
  }
};

/**
 * Sample interrupt/cancellation
 */
export const mockInterrupt: RawJSONLines = {
  type: "user",
  uuid: "user-msg-006",
  timestamp: "2025-11-17T10:00:09.000Z",
  sessionId: "session-123",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_task_001",
        content: null,
        is_error: true,
        error: {
          type: "interrupt",
          message: "Task cancelled by user"
        }
      }
    ]
  }
};

/**
 * Complete session sequence for end-to-end testing
 */
export const mockSessionSequence: RawJSONLines[] = [
  mockUserMessage,
  mockToolUseMessage,
  mockToolResultSuccess,
  mockPermissionRequest,
  mockPermissionApproval,
  mockCoTMessage,
  mockToolError,
  mockPermissionDenial,
  mockSidechainMessage,
  mockInterrupt
];

/**
 * Expected exec-log entries from mockSessionSequence
 */
export const expectedExecLogEntries = [
  {
    kind: "tool-used",
    timestamp: "2025-11-17T10:00:01.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_read_001",
    toolName: "Read",
    epicId: "test-epic"
  },
  {
    kind: "tool-used",
    timestamp: "2025-11-17T10:00:03.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_write_001",
    toolName: "Write",
    epicId: "test-epic"
  },
  {
    kind: "decision",
    timestamp: "2025-11-17T10:00:04.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_write_001",
    decision: "approved",
    mode: "automatic",
    epicId: "test-epic"
  },
  {
    kind: "cot",
    timestamp: "2025-11-17T10:00:07.000Z",
    sessionId: "session-123",
    text: "Based on the README content, I can see this is a TypeScript project with testing infrastructure. The project uses Vitest for testing and has a clear structure with src/ and tests/ directories. I should now check the package.json to understand the dependencies better.",
    truncated: false,
    epicId: "test-epic"
  },
  {
    kind: "tool-used",
    timestamp: "2025-11-17T10:00:07.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_read_003",
    toolName: "Read",
    epicId: "test-epic"
  },
  {
    kind: "blocker",
    timestamp: "2025-11-17T10:00:06.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_read_002",
    blockerType: "tool-error",
    message: "Error: File not found: /home/user/missing.txt",
    epicId: "test-epic"
  },
  {
    kind: "decision",
    timestamp: "2025-11-17T10:00:05.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_bash_001",
    decision: "denied",
    mode: "manual",
    reason: "User rejected destructive command",
    epicId: "test-epic"
  },
  {
    kind: "tool-used",
    timestamp: "2025-11-17T10:00:08.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_task_001",
    toolName: "Task",
    epicId: "test-epic"
  },
  {
    kind: "blocker",
    timestamp: "2025-11-17T10:00:09.000Z",
    sessionId: "session-123",
    toolUseId: "toolu_task_001",
    blockerType: "interrupt",
    message: "Task cancelled by user",
    epicId: "test-epic"
  }
];
