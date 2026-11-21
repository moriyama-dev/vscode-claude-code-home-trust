import * as vscode from 'vscode';
import type { FolderOutcome, TrustScope } from './core/apply';
import { hasFailure, summarizeOutcomes } from './core/apply';
import { MIN_CLAUDE_CODE_VERSION } from './core/trust-report';

export type StatusView =
  | { kind: 'off' }
  | { kind: 'working'; scope: TrustScope }
  | { kind: 'claudeCodeMissing'; scope: TrustScope }
  | { kind: 'claudeCodeTooOld'; scope: TrustScope; version: string }
  | { kind: 'done'; scope: TrustScope; outcomes: FolderOutcome[]; at: Date; retrying: boolean };

export class TrustStatus implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private view: StatusView = { kind: 'off' };

  constructor(command: string) {
    this.item = vscode.window.createStatusBarItem('claudeCodeHomeTrust.status', vscode.StatusBarAlignment.Right, 100);
    this.item.name = vscode.l10n.t('Claude Code Trust');
    this.item.command = command;
    this.item.show();
  }

  /** What the status bar shows right now. */
  get current(): StatusView {
    return this.view;
  }

  show(view: StatusView): void {
    this.view = view;
    const on = vscode.l10n.t('Claude Trust: ON');
    this.item.backgroundColor = undefined;
    switch (view.kind) {
      case 'off':
        this.item.text = `$(workspace-untrusted) ${vscode.l10n.t('Claude Trust: OFF')}`;
        this.item.tooltip = this.tooltip([vscode.l10n.t('Off. Claude Code asks about folders as usual.')]);
        return;
      case 'working':
        this.item.text = `$(sync~spin) ${on}`;
        this.item.tooltip = this.tooltip([vscode.l10n.t('Checking folders…'), scopeLine(view.scope)]);
        return;
      case 'claudeCodeMissing':
        this.item.text = `$(warning) ${on}`;
        this.item.tooltip = this.tooltip([
          vscode.l10n.t('On, but the Claude Code extension was not found on this machine, so nothing was recorded.'),
          scopeLine(view.scope),
        ]);
        return;
      case 'claudeCodeTooOld':
        this.item.text = `$(warning) ${on}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.tooltip = this.tooltip([
          vscode.l10n.t(
            'On, but Claude Code {0} is too old to check folders, so nothing was recorded.',
            escapeMarkdown(view.version),
          ),
          vscode.l10n.t(
            'Update the Claude Code extension to {0} or later, then reload the window.',
            MIN_CLAUDE_CODE_VERSION,
          ),
          scopeLine(view.scope),
        ]);
        return;
      case 'done': {
        const failed = hasFailure(view.outcomes);
        this.item.text = `${failed ? '$(warning)' : '$(workspace-trusted)'} ${on}`;
        if (failed) {
          this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        const lines = [
          failed ? vscode.l10n.t('On, but some folders could not be recorded.') : vscode.l10n.t('On.'),
          scopeLine(view.scope),
          '',
          ...view.outcomes.map(outcomeLine),
          '',
          vscode.l10n.t('Checked at {0}', view.at.toLocaleTimeString()),
        ];
        if (view.retrying) {
          lines.push(vscode.l10n.t('It will check again shortly.'));
        } else if (failed) {
          lines.push(vscode.l10n.t('Click and choose Show Log for the details.'));
        }
        this.item.tooltip = this.tooltip(lines);
        return;
      }
    }
  }

  private tooltip(lines: string[]): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendMarkdown(`**${vscode.l10n.t('Trust Home Folder for Claude Code')}**\n\n`);
    for (const line of lines) {
      markdown.appendMarkdown(line === '' ? '\n\n' : `${line}  \n`);
    }
    markdown.appendMarkdown(`\n\n${vscode.l10n.t('Click for options.')}`);
    return markdown;
  }

  dispose(): void {
    this.item.dispose();
  }
}

export function scopeLabel(scope: TrustScope): string {
  return scope === 'openedFolders'
    ? vscode.l10n.t('Home folder and every opened folder')
    : vscode.l10n.t('Home folder only');
}

/** True when the view says the installed Claude Code is too old for the trust check. */
export function needsClaudeCodeUpdate(view: StatusView): boolean {
  return (
    view.kind === 'claudeCodeTooOld' ||
    (view.kind === 'done' && view.outcomes.some((outcome) => outcome.state === 'claudeCodeTooOld'))
  );
}

/** The view as plain state names for a bug report: no folder paths, not translated. */
export function describeView(view: StatusView): string {
  switch (view.kind) {
    case 'off':
      return 'off';
    case 'working':
      return 'checking';
    case 'claudeCodeMissing':
      return 'Claude Code extension not found';
    case 'claudeCodeTooOld':
      return 'Claude Code extension too old';
    case 'done':
      return summarizeOutcomes(view.outcomes) || 'no folders';
  }
}

function scopeLine(scope: TrustScope): string {
  return vscode.l10n.t('Folders: {0}', scopeLabel(scope));
}

function outcomeLine(outcome: FolderOutcome): string {
  const folder = `\`${outcome.folder}\``;
  switch (outcome.state) {
    case 'alreadyTrusted':
      return `$(check) ${folder} — ${vscode.l10n.t('trusted')}`;
    case 'marked':
      return `$(check) ${folder} — ${vscode.l10n.t('recorded as trusted')}`;
    case 'noConfigFile':
      return `$(info) ${folder} — ${vscode.l10n.t('Claude Code has not been set up yet')}`;
    case 'unsafePath':
      return `$(error) ${folder} — ${vscode.l10n.t('Claude Code does not trust paths with hidden characters')}`;
    case 'claudeCodeTooOld':
      return `$(error) ${folder} — ${vscode.l10n.t('the Claude Code extension is too old; update it to 2.1.323 or later')}`;
    case 'failed':
      return `$(error) ${folder} — ${failureText(outcome)}`;
  }
}

function failureText(outcome: FolderOutcome): string {
  switch (outcome.reason) {
    case 'lockBusy':
      return vscode.l10n.t('not recorded: another program is using the Claude Code settings file');
    case 'configUnreadable':
      return vscode.l10n.t('not recorded: the Claude Code settings file could not be read');
    case 'checkTimedOut':
      return vscode.l10n.t('not recorded: Claude Code did not answer in time');
    case 'stillUntrusted':
      return vscode.l10n.t('recorded, but Claude Code still reports the folder as not trusted');
    case 'other':
    case undefined: {
      const detail = firstLine(outcome.error);
      return detail ? vscode.l10n.t('not recorded: {0}', escapeMarkdown(detail)) : vscode.l10n.t('not recorded');
    }
  }
}

/** The first line of an error message, short enough for a tooltip. */
function firstLine(message: string | undefined): string {
  const line = (message ?? '').split(/\r?\n/).find((part) => part.trim() !== '') ?? '';
  const trimmed = line.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}

/** Text from outside (an error message, a version number) must not be read as Markdown or as an icon. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~$]/g, '\\$&');
}
