import * as vscode from 'vscode';
import type { FolderOutcome, TrustScope } from './core/apply';
import { hasFailure } from './core/apply';

export type StatusView =
  | { kind: 'off' }
  | { kind: 'working'; scope: TrustScope }
  | { kind: 'claudeCodeMissing'; scope: TrustScope }
  | { kind: 'done'; scope: TrustScope; outcomes: FolderOutcome[]; at: Date };

export class TrustStatus implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(command: string) {
    this.item = vscode.window.createStatusBarItem('claudeCodeHomeTrust.status', vscode.StatusBarAlignment.Right, 100);
    this.item.name = vscode.l10n.t('Claude Code Trust');
    this.item.command = command;
    this.item.show();
  }

  show(view: StatusView): void {
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
      case 'done': {
        const failed = hasFailure(view.outcomes);
        this.item.text = `${failed ? '$(warning)' : '$(workspace-trusted)'} ${on}`;
        if (failed) {
          this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        this.item.tooltip = this.tooltip([
          failed ? vscode.l10n.t('On, but some folders could not be recorded.') : vscode.l10n.t('On.'),
          scopeLine(view.scope),
          '',
          ...view.outcomes.map(outcomeLine),
          '',
          vscode.l10n.t('Checked at {0}', view.at.toLocaleTimeString()),
        ]);
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
    case 'failed':
      return `$(error) ${folder} — ${vscode.l10n.t('not recorded')}`;
  }
}
