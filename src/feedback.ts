import * as os from 'node:os';
import * as vscode from 'vscode';
import { claudeCodeVersion } from './claude-binary';
import {
  REPOSITORY_URL,
  buildIssueUrl,
  type FeedbackEnvironment,
  type FeedbackHeadings,
  type FeedbackKind,
} from './core/feedback';

export const REPORT_ISSUE_COMMAND = 'claudeCodeHomeTrust.reportIssue';
export const REQUEST_FEATURE_COMMAND = 'claudeCodeHomeTrust.requestFeature';
export const OPEN_REPOSITORY_COMMAND = 'claudeCodeHomeTrust.openRepository';

function environment(extensionVersion: string, lastCheck: string): FeedbackEnvironment {
  return {
    extensionVersion,
    claudeCodeVersion: claudeCodeVersion(),
    editor: `${vscode.env.appName} ${vscode.version}`,
    os: `${os.type()} ${os.release()} (${process.arch})`,
    remote: vscode.env.remoteName,
    language: vscode.env.language,
    lastCheck,
  };
}

function headings(kind: FeedbackKind): FeedbackHeadings {
  return kind === 'feature'
    ? { first: vscode.l10n.t('What I would like'), second: vscode.l10n.t('What it would make easier') }
    : { first: vscode.l10n.t('What happened'), second: vscode.l10n.t('What I expected') };
}

/** Opens a new GitHub issue with the versions, the platform and the last result already filled in. */
export function openIssue(kind: FeedbackKind, extensionVersion: string, lastCheck: string): Thenable<boolean> {
  const url = buildIssueUrl(kind, headings(kind), environment(extensionVersion, lastCheck), new Date());
  // `true` keeps the already encoded query as it is.
  return vscode.env.openExternal(vscode.Uri.parse(url, true));
}

export function openRepository(): Thenable<boolean> {
  return vscode.env.openExternal(vscode.Uri.parse(REPOSITORY_URL));
}
