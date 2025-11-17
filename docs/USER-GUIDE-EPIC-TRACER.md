# Epic Tracer - User Guide

**Last Updated**: 2025-11-17

## Overview

Epic Tracer is a powerful execution logging tool for Claude Code sessions. It monitors your Claude sessions in real-time and generates compact, analyzable logs that help you understand:

- What tools were used and when
- Which decisions were made (permissions approved/denied)
- What blocked execution (errors, interrupts, timeouts)
- Optional: Claude's chain-of-thought reasoning

## Quick Start

### Basic Usage

```bash
# Trace an active Claude session
happy epic-trace my-feature --session-file ~/.claude/projects/.../session.jsonl

# With session ID (if known)
happy epic-trace my-feature --session-id abc123-def456

# Include chain-of-thought reasoning
happy epic-trace my-feature --session-file <path> --include-cot
```

### Finding Your Session File

Your Claude session files are located in:
```
~/.claude/projects/-<working-directory>/
```

Example:
```bash
# If you're working in /home/user/my-project
ls ~/.claude/projects/-home-user-my-project/*.jsonl

# Find the most recent session
ls -t ~/.claude/projects/-home-user-my-project/*.jsonl | head -1
```

## Command Reference

### Syntax

```
happy epic-trace <epic-id> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<epic-id>` | Yes | Unique identifier for your epic/feature |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--session-id <id>` | string | - | Claude session ID to trace |
| `--session-file <path>` | string | - | Path to session JSONL file |
| `--output-dir <path>` | string | `.claude/epics/<epic>/trace/` | Output directory for exec-logs |
| `--include-cot` | flag | false | Include chain-of-thought extraction |
| `--cot-max-length <n>` | number | 500 | Max CoT text length in characters |
| `--help` | flag | - | Show help message |

**Note**: You must provide either `--session-id` or `--session-file`.

## Use Cases

### 1. Real-Time Monitoring

Monitor an active Claude session to see what it's doing in real-time.

```bash
# Start your Claude session in one terminal
claude

# In another terminal, start the tracer
happy epic-trace feature-auth --session-file ~/.claude/projects/.../session.jsonl
```

**Output**: Live updates as Claude uses tools, makes decisions, and encounters blockers.

### 2. Post-Mortem Analysis

Analyze a completed Claude session to understand what happened.

```bash
# After Claude session completes
happy epic-trace bug-investigation --session-file ~/.claude/projects/.../session.jsonl
```

**Use for**: Debugging why something failed, understanding decision flow, reviewing tool usage patterns.

### 3. Multi-Session Epic Tracking

Track multiple sessions for a single epic/feature.

```bash
# Session 1
happy epic-trace feature-auth --session-id session-1

# Session 2 (later)
happy epic-trace feature-auth --session-id session-2

# All exec-logs saved to:
.claude/epics/feature-auth/trace/
  ├── exec-log-session-1.jsonl
  └── exec-log-session-2.jsonl
```

### 4. Chain-of-Thought Analysis

Capture Claude's reasoning process for analysis or training.

```bash
happy epic-trace research-task --session-file <path> --include-cot --cot-max-length 1000
```

**Use for**: Understanding Claude's decision-making, analyzing reasoning patterns, creating training data.

## Output Format

### File Location

```
.claude/epics/<epic-id>/trace/exec-log-<session-id>.jsonl
```

### Event Types

Each line in the output file is a JSON object with a `kind` field that indicates the event type:

#### 1. Tool Used (`"kind": "tool-used"`)

Recorded when Claude invokes a tool.

```json
{
  "kind": "tool-used",
  "timestamp": "2025-11-17T10:00:01.000Z",
  "sessionId": "session-123",
  "epicId": "test-epic",
  "toolUseId": "toolu_read_001",
  "toolName": "Read",
  "toolInput": {
    "file_path": "/home/user/project/README.md"
  },
  "parentToolUseId": "toolu_task_001"  // Optional: for nested tool calls
}
```

**Fields**:
- `toolName`: Name of the tool (e.g., "Read", "Write", "Bash")
- `toolInput`: Parameters passed to the tool
- `parentToolUseId`: Present if this is a nested tool call (sidechain)

#### 2. Decision (`"kind": "decision"`)

Recorded when a permission is approved or denied.

```json
{
  "kind": "decision",
  "timestamp": "2025-11-17T10:00:04.000Z",
  "sessionId": "session-123",
  "epicId": "test-epic",
  "toolUseId": "toolu_write_001",
  "decision": "approved",
  "mode": "automatic",
  "reason": "File write to safe location"  // Optional
}
```

**Fields**:
- `decision`: "approved" or "denied"
- `mode`: "automatic" or "manual"
- `reason`: Optional explanation for the decision

#### 3. Blocker (`"kind": "blocker"`)

Recorded when execution is blocked or fails.

```json
{
  "kind": "blocker",
  "timestamp": "2025-11-17T10:00:06.000Z",
  "sessionId": "session-123",
  "epicId": "test-epic",
  "toolUseId": "toolu_read_002",
  "blockerType": "tool-error",
  "message": "Error: File not found: /home/user/missing.txt",
  "toolName": "Read"  // Optional
}
```

**Blocker Types**:
- `"tool-error"`: Tool execution failed
- `"permission-denial"`: Permission was denied
- `"interrupt"`: User interrupted execution
- `"timeout"`: Operation timed out
- `"unknown"`: Unclassified blocker

#### 4. Chain of Thought (`"kind": "cot"`)

Recorded when `--include-cot` is enabled. Captures Claude's reasoning text.

```json
{
  "kind": "cot",
  "timestamp": "2025-11-17T10:00:07.000Z",
  "sessionId": "session-123",
  "epicId": "test-epic",
  "text": "Based on the README content, I can see this is a TypeScript project...",
  "truncated": false
}
```

**Fields**:
- `text`: Claude's reasoning text
- `truncated`: `true` if text was truncated to max length

## Analyzing Exec-Logs

### Using `jq` (JSON processor)

```bash
# Count events by type
cat exec-log-*.jsonl | jq -r '.kind' | sort | uniq -c

# List all tools used
cat exec-log-*.jsonl | jq -r 'select(.kind=="tool-used") | .toolName' | sort | uniq

# Find all blockers
cat exec-log-*.jsonl | jq -c 'select(.kind=="blocker")'

# Extract chain-of-thought
cat exec-log-*.jsonl | jq -r 'select(.kind=="cot") | .text'

# Timeline of events
cat exec-log-*.jsonl | jq -r '[.timestamp, .kind, (.toolName // .decision // .blockerType // "")] | @tsv'
```

### Using Python

```python
import json

# Load exec-log
with open('.claude/epics/my-epic/trace/exec-log-session.jsonl') as f:
    events = [json.loads(line) for line in f]

# Count events by type
from collections import Counter
counter = Counter(e['kind'] for e in events)
print(counter)

# Find all Read tool uses
read_events = [e for e in events if e.get('toolName') == 'Read']
print(f"Read tool used {len(read_events)} times")

# Analyze blockers
blockers = [e for e in events if e['kind'] == 'blocker']
for blocker in blockers:
    print(f"{blocker['timestamp']}: {blocker['blockerType']} - {blocker['message']}")
```

### Using TypeScript

```typescript
import fs from 'fs';
import { ExecLogEntry, ExecLogEntrySchema } from '@/epic-tracer';

// Load and validate exec-log
const lines = fs.readFileSync('exec-log-session.jsonl', 'utf-8').split('\n');
const events = lines
  .filter(line => line.trim())
  .map(line => ExecLogEntrySchema.parse(JSON.parse(line)));

// Type-safe analysis
const toolUsed = events.filter(e => e.kind === 'tool-used');
const decisions = events.filter(e => e.kind === 'decision');
const blockers = events.filter(e => e.kind === 'blocker');

console.log(`Tools: ${toolUsed.length}, Decisions: ${decisions.length}, Blockers: ${blockers.length}`);

// Analyze tool usage patterns
const toolCounts = toolUsed.reduce((acc, e) => {
  if (e.kind === 'tool-used') {
    acc[e.toolName] = (acc[e.toolName] || 0) + 1;
  }
  return acc;
}, {} as Record<string, number>);

console.log('Tool usage:', toolCounts);
```

## Advanced Usage

### Custom Output Directory

```bash
# Save to custom location
happy epic-trace my-epic --session-file <path> --output-dir /tmp/my-logs

# Output:
/tmp/my-logs/exec-log-<session-id>.jsonl
```

### Long-Running Sessions

For very long sessions, consider:

1. **Periodic restarts**: Stop and restart the tracer to flush buffers
2. **Monitor disk space**: Exec-logs grow with session activity
3. **Analyze incrementally**: Process logs as they're written

```bash
# Monitor log size
watch -n 5 'ls -lh .claude/epics/my-epic/trace/*.jsonl'
```

### Filtering CoT

Control CoT text length to manage log size:

```bash
# Short CoT (100 chars)
happy epic-trace my-epic --session-file <path> --include-cot --cot-max-length 100

# Long CoT (2000 chars)
happy epic-trace my-epic --session-file <path> --include-cot --cot-max-length 2000
```

## Troubleshooting

### Issue: "Session file not found"

**Cause**: Invalid session file path

**Solution**:
```bash
# Verify file exists
ls ~/.claude/projects/-<your-directory>/*.jsonl

# Use absolute path
happy epic-trace my-epic --session-file /full/path/to/session.jsonl
```

### Issue: "No events in output file"

**Cause**: Session has no tool usage yet, or file is a completed session

**Solution**:
- For active sessions: Wait for Claude to start using tools
- For completed sessions: This is expected behavior (tracer tails NEW events only)

**Workaround** for completed sessions: Start tracer BEFORE Claude session begins

### Issue: "Parse errors in logs"

**Cause**: Malformed JSONL in session file

**Solution**: Epic Tracer handles this gracefully - parse errors are logged but processing continues.

Check logs:
```bash
cat ~/.happy-dev/logs/*.log | grep "parse error"
```

### Issue: High memory usage

**Cause**: Large batches or long sessions

**Solution**:
- Reduce batch size (requires code change, default is 10)
- Disable CoT extraction if not needed
- Restart tracer periodically for long sessions

## Best Practices

### 1. Epic Naming

Use descriptive epic IDs:
```bash
# Good
happy epic-trace feature-user-auth --session-file <path>
happy epic-trace bugfix-memory-leak --session-file <path>

# Avoid
happy epic-trace test --session-file <path>
happy epic-trace x --session-file <path>
```

### 2. Session Organization

Keep exec-logs organized by epic:
```
.claude/epics/
├── feature-auth/
│   └── trace/
│       ├── exec-log-session-1.jsonl
│       └── exec-log-session-2.jsonl
├── bugfix-ui/
│   └── trace/
│       └── exec-log-session-3.jsonl
└── refactor-api/
    └── trace/
        └── exec-log-session-4.jsonl
```

### 3. CoT Usage

Only enable CoT when needed:
- ✅ Research tasks, decision analysis, training data
- ❌ Routine coding, simple scripts (adds overhead)

### 4. Real-Time Monitoring

For real-time monitoring, use separate terminal windows:
```
Terminal 1: claude (your session)
Terminal 2: happy epic-trace ... (tracer)
Terminal 3: tail -f exec-log-*.jsonl | jq . (watch output)
```

## FAQ

### Q: Can I trace multiple sessions simultaneously?

A: Yes! Run separate tracer instances with different session files.

```bash
# Terminal 1
happy epic-trace epic-1 --session-file session-1.jsonl

# Terminal 2
happy epic-trace epic-2 --session-file session-2.jsonl
```

### Q: How much disk space do exec-logs use?

A: Depends on session activity. Typical ranges:
- Small session (10 min, few tools): 1-10 KB
- Medium session (1 hour, moderate): 100 KB - 1 MB
- Large session (8 hours, heavy): 5-50 MB
- With CoT: 2-5x larger

### Q: Can I delete old exec-logs?

A: Yes! Exec-logs are independent files. Delete anytime:
```bash
rm .claude/epics/old-epic/trace/*.jsonl
```

### Q: Does the tracer slow down Claude?

A: No. The tracer is external and only reads session files. It doesn't affect Claude performance.

### Q: Can I use this for non-Epic sessions?

A: Yes! The "epic-id" is just an organizational label. Use any identifier:
```bash
happy epic-trace daily-coding --session-file <path>
happy epic-trace experiment --session-file <path>
```

### Q: What happens if the tracer crashes?

A: Exec-logs are written incrementally. Already-written events are safe. Restart the tracer to continue from where it left off (it will only process NEW events).

## Examples

### Example 1: Debug Why Tests Failed

```bash
# Start tracer for test session
happy epic-trace test-debugging --session-file ~/.claude/projects/-my-project/session.jsonl

# Analyze blockers
cat .claude/epics/test-debugging/trace/*.jsonl | \
  jq -c 'select(.kind=="blocker")' | \
  jq -r '[.timestamp, .blockerType, .message] | @tsv'
```

### Example 2: Analyze Tool Usage Patterns

```bash
# Trace a refactoring session
happy epic-trace refactor-auth --session-file <path>

# Count tool usage
cat .claude/epics/refactor-auth/trace/*.jsonl | \
  jq -r 'select(.kind=="tool-used") | .toolName' | \
  sort | uniq -c | sort -rn

# Output example:
#  45 Read
#  23 Edit
#  12 Grep
#   8 Write
#   3 Bash
```

### Example 3: Extract Decision Timeline

```bash
# Trace with decisions
happy epic-trace security-audit --session-file <path>

# Create decision timeline
cat .claude/epics/security-audit/trace/*.jsonl | \
  jq -r 'select(.kind=="decision") |
    [.timestamp, .decision, .mode, .reason // ""] | @tsv' | \
  column -t -s $'\t'
```

## Support

### Getting Help

```bash
# Show help
happy epic-trace --help

# Check version
happy --version

# Run diagnostics
happy doctor
```

### Reporting Issues

If you encounter issues:
1. Check `~/.happy-dev/logs/*.log` for error messages
2. Verify session file format: `head ~/.claude/projects/.../session.jsonl | jq .`
3. Test with `--help` to ensure CLI is working
4. Report issue with log excerpts and session details

## See Also

- [Implementation Guide](../EPIC-TRACER-IMPLEMENTATION-COMPLETE.md)
- [Validation Summary](../EPIC-TRACER-VALIDATION-SUMMARY.md)
- [Effectiveness Analysis](epic-tracer-effectiveness-analysis.md)
