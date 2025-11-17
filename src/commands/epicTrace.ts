/**
 * Epic Trace CLI command handler
 *
 * Provides commands to start, stop, and manage epic tracers
 */

import chalk from 'chalk';
import { EpicTracer } from '@/epic-tracer';
import { logger } from '@/ui/logger';

/**
 * Show help for epic-trace command
 */
function showHelp(): void {
    console.log(`
${chalk.bold('happy epic-trace')} - Epic execution tracer for Claude Code

${chalk.bold('Usage:')}
  happy epic-trace <epic-id> [options]    Start tracing a Claude Code session
  happy epic-trace --help                 Show this help

${chalk.bold('Options:')}
  --session-id <id>       Trace a specific session ID (required)
  --cwd <path>            Working directory (defaults to current directory)
  --output-dir <path>     Override default output directory
  --no-cot                Disable chain-of-thought extraction
  --cot-max-length <num>  Max CoT text length (default: 500)

${chalk.bold('Examples:')}
  # Trace a session for the "payments" epic
  happy epic-trace payments --session-id abc-123

  # Trace with custom output directory
  happy epic-trace auth-refactor --session-id xyz-789 --output-dir ./traces

  # Trace without chain-of-thought
  happy epic-trace bugfix --session-id test-001 --no-cot

${chalk.bold('Output:')}
  Exec-logs are written to:
  ${chalk.gray('.claude/epics/<epic>/trace/exec-log-<session-id>.jsonl')}

${chalk.bold('Note:')} The tracer runs in the foreground. Press Ctrl+C to stop.
`);
}

/**
 * Parse command line arguments for epic-trace
 */
interface EpicTraceArgs {
    epicId: string;
    sessionId?: string;
    cwd: string;
    outputDir?: string;
    includeCoT: boolean;
    cotMaxLength: number;
    showHelp: boolean;
}

function parseArgs(args: string[]): EpicTraceArgs {
    const parsed: EpicTraceArgs = {
        epicId: '',
        cwd: process.cwd(),
        includeCoT: true,
        cotMaxLength: 500,
        showHelp: false,
    };

    // First arg should be epic ID (unless it's --help)
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        parsed.showHelp = true;
        return parsed;
    }

    parsed.epicId = args[0];

    // Parse remaining options
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--help':
            case '-h':
                parsed.showHelp = true;
                break;
            case '--session-id':
                parsed.sessionId = args[++i];
                break;
            case '--cwd':
                parsed.cwd = args[++i];
                break;
            case '--output-dir':
                parsed.outputDir = args[++i];
                break;
            case '--no-cot':
                parsed.includeCoT = false;
                break;
            case '--cot-max-length':
                parsed.cotMaxLength = parseInt(args[++i], 10);
                break;
            default:
                console.error(chalk.red(`Unknown option: ${arg}`));
                process.exit(1);
        }
    }

    return parsed;
}

/**
 * Handle epic-trace command
 */
export async function handleEpicTraceCommand(args: string[]): Promise<void> {
    const parsed = parseArgs(args);

    if (parsed.showHelp) {
        showHelp();
        return;
    }

    // Validate required arguments
    if (!parsed.epicId) {
        console.error(chalk.red('Error: Epic ID is required'));
        console.log(chalk.gray('Run "happy epic-trace --help" for usage information.'));
        process.exit(1);
    }

    if (!parsed.sessionId) {
        console.error(chalk.red('Error: --session-id is required'));
        console.log(chalk.gray('Run "happy epic-trace --help" for usage information.'));
        process.exit(1);
    }

    // Create tracer
    const tracer = new EpicTracer({
        epicId: parsed.epicId,
        workingDirectory: parsed.cwd,
        sessionId: parsed.sessionId,
        outputDir: parsed.outputDir,
        includeCoT: parsed.includeCoT,
        cotMaxLength: parsed.cotMaxLength,
    });

    // Set up graceful shutdown
    const shutdown = async () => {
        console.log(chalk.yellow('\n\n📊 Stopping tracer...'));
        await tracer.stop();
        console.log(chalk.green('✓ Tracer stopped'));
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start tracer
    try {
        console.log(chalk.blue(`📊 Starting epic tracer for: ${chalk.bold(parsed.epicId)}`));
        console.log(chalk.gray(`   Session: ${parsed.sessionId}`));
        console.log(chalk.gray(`   Working directory: ${parsed.cwd}`));

        await tracer.start();

        const logPath = tracer.getExecLogPath();
        if (logPath) {
            console.log(chalk.green(`✓ Tracer started successfully`));
            console.log(chalk.gray(`   Output: ${logPath}`));
        }

        console.log(chalk.gray('\n   Press Ctrl+C to stop\n'));

        // Keep process alive
        await new Promise(() => { }); // Never resolves - wait for SIGINT
    } catch (error) {
        console.error(chalk.red('✗ Failed to start tracer'));
        console.error(error instanceof Error ? error.message : 'Unknown error');
        if (process.env.DEBUG) {
            console.error(error);
        }
        process.exit(1);
    }
}
