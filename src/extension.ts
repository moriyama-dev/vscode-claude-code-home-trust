import * as os from 'node:os';
import * as vscode from 'vscode';
import { findClaudeBinary } from './claude-binary';
import { ensureTrusted, foldersFor, parseScope, type FolderOutcome, type TrustScope } from './core/apply';
import { configFilePath, markTrusted } from './core/config-file';
import { readTrustReport } from './core/trust-report';
import { scopeLabel, TrustStatus } from './trust-status';

const SECTION = 'claudeCodeHomeTrust';
const SHOW_MENU = 'claudeCodeHomeTrust.showMenu';
const TOGGLE = 'claudeCodeHomeTrust.toggle';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel(vscode.l10n.t('Trust Home Folder for Claude Code'), { log: true });
  const status = new TrustStatus(SHOW_MENU);
  context.subscriptions.push(log, status);

  // Runs one check at a time; a change that arrives mid-check queues one more.
  let running: Promise<void> = Promise.resolve();
  const apply = (): Promise<void> => {
    running = running.then(() => applyOnce(status, log)).catch((error: unknown) => log.error(String(error)));
    return running;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_MENU, () => showMenu(apply)),
    vscode.commands.registerCommand(TOGGLE, () => setEnabled(!readSettings().enabled)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) {
        void apply();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (readSettings().scope === 'openedFolders') {
        void apply();
      }
    }),
  );

  void apply();
}

export function deactivate(): void {}

interface Settings {
  enabled: boolean;
  scope: TrustScope;
}

function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return { enabled: config.get<boolean>('enabled', false), scope: parseScope(config.get('scope')) };
}

async function applyOnce(status: TrustStatus, log: vscode.LogOutputChannel): Promise<void> {
  const { enabled, scope } = readSettings();
  if (!enabled) {
    status.show({ kind: 'off' });
    return;
  }

  const binary = findClaudeBinary();
  if (!binary) {
    log.warn('The Claude Code extension is not installed on this machine; nothing to record.');
    status.show({ kind: 'claudeCodeMissing', scope });
    return;
  }

  status.show({ kind: 'working', scope });
  const opened = (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => folder.uri.fsPath);
  const folders = foldersFor(scope, os.homedir(), opened);
  const configPath = configFilePath(process.env, os.homedir());

  const outcomes = await ensureTrusted(folders, {
    report: (folder) => readTrustReport(binary, folder),
    mark: (key) => markTrusted(configPath, key),
  });
  outcomes.forEach((outcome) => logOutcome(log, outcome, configPath));
  status.show({ kind: 'done', scope, outcomes, at: new Date() });
}

function logOutcome(log: vscode.LogOutputChannel, outcome: FolderOutcome, configPath: string): void {
  switch (outcome.state) {
    case 'alreadyTrusted':
      log.info(`${outcome.folder}: already trusted`);
      return;
    case 'marked':
      log.info(`${outcome.folder}: recorded as trusted in ${configPath}`);
      return;
    case 'noConfigFile':
      log.info(`${outcome.folder}: ${configPath} does not exist yet; nothing recorded`);
      return;
    case 'unsafePath':
      log.warn(`${outcome.folder}: the path holds hidden or control characters; Claude Code will not trust it`);
      return;
    case 'failed':
      log.error(`${outcome.folder}: ${outcome.error ?? 'failed'}`);
      return;
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update('enabled', enabled, vscode.ConfigurationTarget.Global);
}

async function setScope(scope: TrustScope): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update('scope', scope, vscode.ConfigurationTarget.Global);
}

interface MenuItem extends vscode.QuickPickItem {
  run(): Thenable<unknown>;
}

async function showMenu(apply: () => Promise<void>): Promise<void> {
  const { enabled, scope } = readSettings();
  // Each group reads like a set of radio buttons: the current choice is filled, the others are empty circles.
  const radio = (selected: boolean): string => (selected ? '$(pass-filled)' : '$(circle-large-outline)');
  const enabledItem = (value: boolean, label: string, detail: string): MenuItem => ({
    label: `${radio(value === enabled)} ${label}`,
    detail,
    run: () => (value === enabled ? Promise.resolve() : setEnabled(value)),
  });
  const scopeItem = (value: TrustScope, detail: string): MenuItem => ({
    label: `${radio(value === scope)} ${scopeLabel(value)}`,
    detail,
    run: () => (value === scope ? Promise.resolve() : chooseScope(value)),
  });
  const separator = (label: string): vscode.QuickPickItem => ({ label, kind: vscode.QuickPickItemKind.Separator });

  const items: (MenuItem | vscode.QuickPickItem)[] = [
    separator(vscode.l10n.t('On / Off')),
    enabledItem(true, vscode.l10n.t('ON'), vscode.l10n.t('Record folders as trusted so the dialog does not appear.')),
    enabledItem(false, vscode.l10n.t('OFF'), vscode.l10n.t('Claude Code asks about folders as usual.')),
    separator(vscode.l10n.t('Folders')),
    scopeItem('homeFolder', vscode.l10n.t('Claude Code never remembers its answer for this folder.')),
    scopeItem('openedFolders', vscode.l10n.t('Also trusts every folder opened in a window. Use with care.')),
    separator(vscode.l10n.t('Actions')),
    { label: `$(refresh) ${vscode.l10n.t('Check Again Now')}`, run: apply } satisfies MenuItem,
    {
      label: `$(gear) ${vscode.l10n.t('Open Settings')}`,
      run: () =>
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          `@ext:moriyama-dev.vscode-claude-code-home-trust`,
        ),
    } satisfies MenuItem,
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Trust Home Folder for Claude Code'),
    placeHolder: vscode.l10n.t(
      'Now: {0} · {1}',
      enabled ? vscode.l10n.t('ON') : vscode.l10n.t('OFF'),
      scopeLabel(scope),
    ),
  });
  if (picked && 'run' in picked) {
    await picked.run();
  }
}

async function chooseScope(scope: TrustScope): Promise<void> {
  if (scope === 'openedFolders') {
    const confirm = vscode.l10n.t('Trust Opened Folders');
    const answer = await vscode.window.showWarningMessage(
      vscode.l10n.t('Trust every folder you open in Claude Code?'),
      {
        modal: true,
        detail: vscode.l10n.t(
          "A folder's .claude/settings.json and .mcp.json can run programs on your computer: hooks, environment variables, helper commands and MCP servers. With this choice they are used without asking, so a folder you download or clone runs them as soon as you open it.",
        ),
      },
      confirm,
    );
    if (answer !== confirm) {
      return;
    }
  }
  await setScope(scope);
}
