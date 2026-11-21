import { ConfigLockBusyError, ConfigUnreadableError, type MarkResult } from './config-file';
import { ClaudeCodeTooOldError, TrustCheckTimeoutError, type TrustReport } from './trust-report';

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
  /** The installed Claude Code is too old to answer the trust check. */
  | 'claudeCodeTooOld'
  | 'failed';

/** Why a folder ended up `failed`. */
export type FailureReason =
  /** Another process kept the config file's lock for the whole wait. */
  | 'lockBusy'
  /** The config file is there but is not the JSON object Claude Code writes. */
  | 'configUnreadable'
  /** Claude Code did not answer the trust check in time. */
  | 'checkTimedOut'
  /** The record was written, yet Claude Code still reports the folder as not trusted. */
  | 'stillUntrusted'
  /** Anything else; `error` holds the message. */
  | 'other';

export interface FolderOutcome {
  folder: string;
  state: FolderState;
  /** Set when `state` is `failed`. */
  reason?: FailureReason;
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
      return {
        folder,
        state: 'failed',
        reason: 'stillUntrusted',
        error: 'Claude Code still reports the folder as not trusted',
      };
    }
    return { folder, state: 'marked' };
  } catch (error) {
    if (error instanceof ClaudeCodeTooOldError) {
      return { folder, state: 'claudeCodeTooOld', error: error.message };
    }
    return {
      folder,
      state: 'failed',
      reason: failureReason(error),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function failureReason(error: unknown): FailureReason {
  if (error instanceof ConfigLockBusyError) {
    return 'lockBusy';
  }
  if (error instanceof ConfigUnreadableError) {
    return 'configUnreadable';
  }
  if (error instanceof TrustCheckTimeoutError) {
    return 'checkTimedOut';
  }
  return 'other';
}

export function hasFailure(outcomes: readonly FolderOutcome[]): boolean {
  return outcomes.some(
    (outcome) => outcome.state === 'failed' || outcome.state === 'unsafePath' || outcome.state === 'claudeCodeTooOld',
  );
}

/**
 * True when checking again on its own may help: a failed folder is usually a
 * busy lock or a slow answer. An unsafe path or an outdated Claude Code stays
 * the same until the user changes something.
 */
export function isWorthRetrying(outcomes: readonly FolderOutcome[]): boolean {
  return outcomes.some((outcome) => outcome.state === 'failed');
}

/** The states of a check without the folder paths, for a bug report. */
export function summarizeOutcomes(outcomes: readonly FolderOutcome[]): string {
  return outcomes
    .map((outcome) => (outcome.reason ? `${outcome.state} (${outcome.reason})` : outcome.state))
    .join(', ');
}
