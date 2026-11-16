import type { MarkResult } from './config-file';
import type { TrustReport } from './trust-report';

export type TrustScope = 'homeFolder' | 'openedFolders';

export type FolderState =
  /** Claude Code already had a trust record for the folder. */
  | 'alreadyTrusted'
  /** The extension wrote the record and Claude Code now reports the folder as trusted. */
  | 'marked'
  /** Claude Code refuses to trust this path (hidden or control characters). */
  | 'unsafePath'
  /** There is no Claude Code config file yet, so there is nothing to record into. */
  | 'noConfigFile'
  | 'failed';

export interface FolderOutcome {
  folder: string;
  state: FolderState;
  error?: string;
}

export interface ApplyDeps {
  report(folder: string): Promise<TrustReport>;
  mark(key: string): Promise<MarkResult>;
}

/** The folders to record as trusted: always the home folder, plus the opened folders when the scope asks for them. */
export function foldersFor(scope: TrustScope, homeDir: string, openedFolders: readonly string[]): string[] {
  const folders = scope === 'openedFolders' ? [homeDir, ...openedFolders] : [homeDir];
  return [...new Set(folders)];
}

export function parseScope(value: unknown): TrustScope {
  return value === 'openedFolders' ? 'openedFolders' : 'homeFolder';
}

export async function ensureTrusted(folders: readonly string[], deps: ApplyDeps): Promise<FolderOutcome[]> {
  const outcomes: FolderOutcome[] = [];
  for (const folder of folders) {
    outcomes.push(await ensureFolder(folder, deps));
  }
  return outcomes;
}

async function ensureFolder(folder: string, deps: ApplyDeps): Promise<FolderOutcome> {
  try {
    const before = await deps.report(folder);
    if (before.trusted) {
      return { folder, state: 'alreadyTrusted' };
    }
    if (before.unsafePath) {
      return { folder, state: 'unsafePath' };
    }

    const result = await deps.mark(before.root ?? before.directory);
    if (result === 'noConfigFile') {
      return { folder, state: 'noConfigFile' };
    }

    // Ask again rather than trusting the write: this is the same check Claude Code runs before its dialog.
    const after = await deps.report(folder);
    if (!after.trusted) {
      return { folder, state: 'failed', error: 'Claude Code still reports the folder as not trusted' };
    }
    return { folder, state: 'marked' };
  } catch (error) {
    return { folder, state: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

export function hasFailure(outcomes: readonly FolderOutcome[]): boolean {
  return outcomes.some((outcome) => outcome.state === 'failed' || outcome.state === 'unsafePath');
}
