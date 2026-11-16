import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * Fields Claude Code gives a project entry it creates itself. A new entry gets
 * the same shape, so Claude Code never reads a half-filled record.
 */
const DEFAULT_PROJECT = {
  allowedTools: [],
  mcpContextUris: [],
  mcpServers: {},
  enabledMcpjsonServers: [],
  disabledMcpjsonServers: [],
  hasTrustDialogAccepted: false,
  hasClaudeMdExternalIncludesApproved: false,
  hasClaudeMdExternalIncludesWarningShown: false,
};

export type MarkResult = 'alreadyTrusted' | 'marked' | 'noConfigFile';

export class ConfigLockBusyError extends Error {
  constructor(lockPath: string) {
    super(`Another process is holding ${lockPath}`);
    this.name = 'ConfigLockBusyError';
  }
}

export class ConfigUnreadableError extends Error {
  constructor(configPath: string, reason: string) {
    super(`${configPath} could not be read: ${reason}`);
    this.name = 'ConfigUnreadableError';
  }
}

export interface MarkOptions {
  /** How long to wait for another process to release the lock. */
  lockTimeoutMs?: number;
  /** Pause between attempts to take the lock. */
  retryDelayMs?: number;
}

/** The global Claude Code config file, honoring CLAUDE_CONFIG_DIR like the CLI does. */
export function configFilePath(env: NodeJS.ProcessEnv, homeDir: string): string {
  const dir = env.CLAUDE_CONFIG_DIR;
  return dir ? path.join(dir, '.claude.json') : path.join(homeDir, '.claude.json');
}

/**
 * Sets `projects[key].hasTrustDialogAccepted` to true in the config file.
 *
 * The CLI guards its own writes with a lock directory next to the file
 * (`<file>.lock`), so this takes the same lock, reads the file fresh under it,
 * changes only the one entry and replaces the file in a single rename. Nothing
 * is written when the file is missing or does not parse.
 */
export async function markTrusted(configPath: string, key: string, options: MarkOptions = {}): Promise<MarkResult> {
  const lockPath = `${configPath}.lock`;
  await acquireLock(lockPath, options.lockTimeoutMs ?? 5000, options.retryDelayMs ?? 100);
  try {
    let text: string;
    let mode: number;
    try {
      const stat = await fs.stat(configPath);
      mode = stat.mode & 0o777;
      text = await fs.readFile(configPath, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return 'noConfigFile';
      }
      throw error;
    }

    let config: unknown;
    try {
      config = JSON.parse(text);
    } catch (error) {
      throw new ConfigUnreadableError(configPath, error instanceof Error ? error.message : String(error));
    }
    if (!isRecord(config)) {
      throw new ConfigUnreadableError(configPath, 'the top level is not an object');
    }

    const projects = config.projects === undefined ? {} : config.projects;
    if (!isRecord(projects)) {
      throw new ConfigUnreadableError(configPath, '"projects" is not an object');
    }
    const entry = projects[key];
    if (isRecord(entry) && entry.hasTrustDialogAccepted === true) {
      return 'alreadyTrusted';
    }

    projects[key] = { ...DEFAULT_PROJECT, ...(isRecord(entry) ? entry : {}), hasTrustDialogAccepted: true };
    config.projects = projects;

    // Same layout as the CLI writes: two-space indent, no trailing newline.
    const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode });
      await fs.rename(tempPath, configPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
    return 'marked';
  } finally {
    await fs.rmdir(lockPath).catch(() => undefined);
  }
}

async function acquireLock(lockPath: string, timeoutMs: number, retryDelayMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fs.mkdir(lockPath);
      return;
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'EEXIST') {
        throw error;
      }
      // A lock left behind by a crashed process is not removed here: the CLI
      // clears stale locks itself, and taking one over could clobber its write.
      if (Date.now() >= deadline) {
        throw new ConfigLockBusyError(lockPath);
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
