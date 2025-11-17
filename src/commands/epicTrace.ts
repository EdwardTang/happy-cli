/**
 * CLI command handler for epic-trace
 *
 * Usage: happy epic-trace <epic-id> [options]
 *
 * Options:
 *   --session-id <id>      Session ID to trace
 *   --session-file <path>  Path to session JSONL file
 *   --output-dir <path>    Output directory for exec-logs
 *   --include-cot          Include chain-of-thought extraction
 *   --cot-max-length <n>   Max CoT text length (default: 500)
 */

import path from "path";
import { EpicTracer } from "@/epic-tracer/epicTracer";
import type { EpicTracerConfig } from "@/epic-tracer/types";
import { logger } from "@/ui/logger";

interface EpicTraceArgs {
  epicId?: string;
  sessionId?: string;
  sessionFile?: string;
  outputDir?: string;
  includeCot?: boolean;
  cotMaxLength?: number;
}

/**
 * Parse command line arguments for epic-trace command
 */
function parseArgs(args: string[]): EpicTraceArgs {
  const parsed: EpicTraceArgs = {};

  // First positional arg is epic-id
  if (args.length > 0 && !args[0].startsWith("--")) {
    parsed.epicId = args.shift();
  }

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--session-id":
        parsed.sessionId = args[++i];
        break;
      case "--session-file":
        parsed.sessionFile = args[++i];
        break;
      case "--output-dir":
        parsed.outputDir = args[++i];
        break;
      case "--include-cot":
        parsed.includeCot = true;
        break;
      case "--cot-max-length":
        parsed.cotMaxLength = parseInt(args[++i], 10);
        break;
      case "--help":
        return { epicId: "help" };
      default:
        console.error(`Unknown option: ${arg}`);
        return { epicId: "help" };
    }
  }

  return parsed;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
happy epic-trace - Epic execution tracer for Claude Code sessions

USAGE:
  happy epic-trace <epic-id> [options]

ARGUMENTS:
  <epic-id>                 Epic identifier (required)

OPTIONS:
  --session-id <id>         Session ID to trace (optional if --session-file provided)
  --session-file <path>     Path to session JSONL file (optional)
  --output-dir <path>       Output directory for exec-logs (default: .claude/epics/<epic>/trace/)
  --include-cot             Include chain-of-thought extraction (default: false)
  --cot-max-length <n>      Max CoT text length in characters (default: 500)
  --help                    Show this help message

EXAMPLES:
  # Trace a session by session ID (auto-discover file)
  happy epic-trace feature-auth --session-id c6509f74-5049-430c-a1ca-739b7a6047a8

  # Trace a session by explicit file path
  happy epic-trace feature-auth --session-file ~/.claude/projects/.../session.jsonl

  # Include chain-of-thought with custom max length
  happy epic-trace feature-auth --session-id abc123 --include-cot --cot-max-length 1000

OUTPUT:
  Exec-log file will be written to:
    .claude/epics/<epic-id>/trace/exec-log-<session-id>.jsonl

  Each line is a JSON object with exec-log events:
    - tool-used: Tool invocations
    - decision: Permission approvals/denials
    - blocker: Errors, interrupts, timeouts
    - cot: Chain-of-thought reasoning (if --include-cot)

NOTES:
  - Session file must exist and be in Claude Code RawJSONLines format
  - Tracer runs continuously until interrupted (Ctrl+C)
  - Real-time tailing: new events are written as session progresses
  `);
}

/**
 * Validate arguments
 */
function validateArgs(args: EpicTraceArgs): string | null {
  if (!args.epicId) {
    return "Error: <epic-id> is required";
  }

  if (!args.sessionId && !args.sessionFile) {
    return "Error: Either --session-id or --session-file is required";
  }

  if (args.cotMaxLength && (args.cotMaxLength < 1 || args.cotMaxLength > 10000)) {
    return "Error: --cot-max-length must be between 1 and 10000";
  }

  return null;
}

/**
 * Main command handler
 */
export async function handleEpicTraceCommand(args: string[]): Promise<void> {
  // Parse arguments
  const parsed = parseArgs(args);

  // Show help if requested
  if (parsed.epicId === "help") {
    printHelp();
    return;
  }

  // Validate arguments
  const validationError = validateArgs(parsed);
  if (validationError) {
    console.error(validationError);
    console.error("\nRun 'happy epic-trace --help' for usage information");
    process.exit(1);
  }

  // Build configuration
  const config: EpicTracerConfig = {
    epicId: parsed.epicId!,
    sessionId: parsed.sessionId,
    sessionFile: parsed.sessionFile,
    outputDir: parsed.outputDir,
    includeCoT: parsed.includeCot ?? false,
    cotMaxLength: parsed.cotMaxLength ?? 500
  };

  // Create tracer
  const tracer = new EpicTracer(config);

  // Handle graceful shutdown
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n\nReceived ${signal}, stopping tracer...`);

    try {
      await tracer.stop();

      const status = tracer.getStatus();
      console.log("\nEpic tracer stopped successfully");
      console.log(`  Events processed: ${status.eventsProcessed}`);
      console.log(`  Events written: ${status.eventsWritten}`);
      console.log(`  Parse errors: ${status.parseErrors}`);

      if (status.outputFile) {
        console.log(`\nExec-log file: ${status.outputFile}`);
      }

      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start tracer
  try {
    console.log(`Starting epic tracer for: ${config.epicId}`);
    console.log(`Session: ${config.sessionId || config.sessionFile}`);
    console.log(`Include CoT: ${config.includeCoT}`);
    console.log();

    await tracer.start();

    const status = tracer.getStatus();
    console.log(`✓ Tracer started successfully`);

    if (status.outputFile) {
      console.log(`✓ Output file: ${status.outputFile}`);
    }

    console.log("\nTailing session... (Press Ctrl+C to stop)\n");

    // Keep process alive
    await new Promise(() => {}); // Never resolves
  } catch (error) {
    console.error("\nFailed to start epic tracer:");
    console.error(error instanceof Error ? error.message : String(error));

    logger.warn("Epic tracer startup failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    process.exit(1);
  }
}
