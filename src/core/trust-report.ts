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
          reject(new Error(detail ? `${error.message}: ${detail}` : error.message));
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
