import { execFile } from 'node:child_process';

/** What `claude workspace-trust --json` prints for the folder it runs in. */
export interface TrustReport {
  trusted: boolean;
  directory: string;
  /** The folder whose record decides trust, when it is not `directory` itself (a Git repository root). */
  root?: string;
  /** The path holds hidden or control characters; Claude Code refuses to trust it. */
  unsafePath: boolean;
}

/** The first Claude Code release that has `workspace-trust --json`. */
export const MIN_CLAUDE_CODE_VERSION = '2.1.323';

/**
 * The CLI is from a Claude Code release that does not have
 * `workspace-trust --json` yet.
 */
export class ClaudeCodeTooOldError extends Error {
  constructor(detail: string) {
    super(`This Claude Code does not support "workspace-trust --json"; update the Claude Code extension: ${detail}`);
    this.name = 'ClaudeCodeTooOldError';
  }
}

/** The CLI was still running when the time limit ran out. */
export class TrustCheckTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude Code did not answer within ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = 'TrustCheckTimeoutError';
  }
}

/** True when the CLI rejected the command line itself rather than failing while running it. */
export function isUnsupportedCommand(stderr: string): boolean {
  return /unknown (option|command)/i.test(stderr);
}

/**
 * True when a Claude Code version number is older than the first release with
 * `workspace-trust --json`. A version that cannot be read is not called old:
 * the CLI itself then gets to say whether it knows the command.
 */
export function isClaudeCodeTooOld(version: string | undefined): boolean {
  const installed = parseVersion(version);
  const minimum = parseVersion(MIN_CLAUDE_CODE_VERSION);
  if (!installed || !minimum) {
    return false;
  }
  for (let index = 0; index < minimum.length; index++) {
    if (installed[index] !== minimum[index]) {
      return installed[index] < minimum[index];
    }
  }
  return false;
}

function parseVersion(version: string | undefined): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/**
 * Asks the Claude Code CLI whether `folder` is trusted. The CLI decides which
 * record counts (the folder itself or its repository root), so the extension
 * never has to guess Claude Code's own path rules.
 */
export function readTrustReport(binaryPath: string, folder: string, timeoutMs = 20000): Promise<TrustReport> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ['workspace-trust', '--json'],
      { cwd: folder, timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim();
          if (isUnsupportedCommand(detail)) {
            reject(new ClaudeCodeTooOldError(detail));
            return;
          }
          if (error.killed) {
            reject(new TrustCheckTimeoutError(timeoutMs));
            return;
          }
          reject(new Error(detail ? `Claude Code reported an error: ${detail}` : error.message));
          return;
        }
        try {
          resolve(parseTrustReport(stdout));
        } catch (parseError) {
          reject(parseError instanceof Error ? parseError : new Error(String(parseError)));
        }
      },
    );
  });
}

export function parseTrustReport(stdout: string): TrustReport {
  const line = stdout
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.startsWith('{'));
  if (line === undefined) {
    throw new Error(`Unexpected output from Claude Code: ${stdout.trim().slice(0, 200)}`);
  }
  const value: unknown = JSON.parse(line);
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { trusted?: unknown }).trusted !== 'boolean' ||
    typeof (value as { directory?: unknown }).directory !== 'string'
  ) {
    throw new Error(`Unexpected output from Claude Code: ${line.slice(0, 200)}`);
  }
  const report = value as { trusted: boolean; directory: string; root?: unknown; unsafe_path?: unknown };
  return {
    trusted: report.trusted,
    directory: report.directory,
    root: typeof report.root === 'string' ? report.root : undefined,
    unsafePath: report.unsafe_path === true,
  };
}
