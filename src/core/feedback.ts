export const REPOSITORY_URL = 'https://github.com/moriyama-dev/vscode-claude-code-home-trust';

export type FeedbackKind = 'issue' | 'feature';

/** Only versions, platform names and state names: nothing that identifies the user or their folders. */
export interface FeedbackEnvironment {
  extensionVersion: string;
  /** Version of the Claude Code extension, when it is installed. */
  claudeCodeVersion?: string;
  editor: string;
  os: string;
  /** Kind of remote window (`ssh-remote`, `wsl`, ...), when there is one. */
  remote?: string;
  language: string;
  /** The result of the last check as state names, without folder paths. */
  lastCheck: string;
}

/** Section headings of the issue body, in the user's UI language. */
export interface FeedbackHeadings {
  first: string;
  second: string;
}

/** Local time in Toronto, where the issues are read. */
export function torontoTimestamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return `${parts} (America/Toronto)`;
}

export function buildIssueBody(headings: FeedbackHeadings, env: FeedbackEnvironment, now: Date): string {
  return [
    `## ${headings.first}`,
    '',
    '',
    `## ${headings.second}`,
    '',
    '',
    '## Environment',
    '',
    `- Trust Home Folder for Claude Code: ${env.extensionVersion}`,
    `- Claude Code extension: ${env.claudeCodeVersion ?? 'not installed'}`,
    `- Last check: ${env.lastCheck}`,
    `- Editor: ${env.editor}`,
    `- OS: ${env.os}`,
    `- Remote: ${env.remote ?? 'none'}`,
    `- UI language: ${env.language}`,
    `- Date: ${torontoTimestamp(now)}`,
  ].join('\n');
}

/**
 * The URL of a pre-filled "new issue" page on GitHub. Nothing is sent until
 * the user submits the issue there.
 */
export function buildIssueUrl(
  kind: FeedbackKind,
  headings: FeedbackHeadings,
  env: FeedbackEnvironment,
  now: Date,
): string {
  const body = encodeURIComponent(buildIssueBody(headings, env, now));
  const label = kind === 'feature' ? '&labels=enhancement' : '';
  return `${REPOSITORY_URL}/issues/new?body=${body}${label}`;
}
