import * as os from 'node:os';
import * as vscode from 'vscode';
import { CLAUDE_CODE_EXTENSION_ID, claudeCodeVersion, findClaudeBinary } from './claude-binary';
import {
  ensureTrusted,
  foldersFor,
  isWorthRetrying,
  parseScope,
  type FolderOutcome,
  type TrustScope,
} from './core/apply';
import { configFilePath, markTrusted } from './core/config-file';
import { MIN_CLAUDE_CODE_VERSION, isClaudeCodeTooOld, readTrustReport } from './core/trust-report';
import {
  OPEN_REPOSITORY_COMMAND,
  REPORT_ISSUE_COMMAND,
  REQUEST_FEATURE_COMMAND,
  openIssue,
  openRepository,
} from './feedback';
import { describeView, needsClaudeCodeUpdate, scopeLabel, TrustStatus, type StatusView } from './trust-status';

const SECTION = 'claudeCodeHomeTrust';
const SHOW_MENU = 'claudeCodeHomeTrust.showMenu';
const TOGGLE = 'claudeCodeHomeTrust.toggle';

/**
 * How long to wait before each automatic re-check after a folder could not be
 * recorded. A busy lock or a slow answer is usually gone by then.
 */
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel(vscode.l10n.t('Trust Home Folder for Claude Code'), { log: true });
  const status = new TrustStatus(SHOW_MENU);
  context.subscriptions.push(log, status);
  const packageVersion = (context.extension.packageJSON as { version?: unknown }).version;
  const version = typeof packageVersion === 'string' ? packageVersion : 'unknown';

  // Runs one check at a time; a change that arrives mid-check queues one more.
  let running: Promise<void> = Promise.resolve();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retriesUsed = 0;

  const run = (isRetry: boolean): Promise<void> => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    if (!isRetry) {
      retriesUsed = 0;
    }
    running = running
      .then(async () => {
        const view = await check(status, log);
        if (view.kind !== 'done' || !isWorthRetrying(view.outcomes) || retriesUsed >= RETRY_DELAYS_MS.length) {
          status.show(view);
          return;
        }
        const delay = RETRY_DELAYS_MS[retriesUsed];
        retriesUsed += 1;
        log.info(`Checking again in ${delay / 1000} seconds`);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void run(true), delay);
        status.show({ ...view, retrying: true });
      })
      .catch((error: unknown) => log.error(String(error)));
    return running;
  };
  const apply = (): Promise<void> => run(false);

  context.subscriptions.push(
    { dispose: () => clearTimeout(retryTimer) },
    vscode.commands.registerCommand(SHOW_MENU, () => showMenu(apply, status, log, version)),
    vscode.commands.registerCommand(TOGGLE, () => setEnabled(!readSettings().enabled)),
    vscode.commands.registerCommand(REPORT_ISSUE_COMMAND, () =>
      openIssue('issue', version, describeView(status.current)),
    ),
    vscode.commands.registerCommand(REQUEST_FEATURE_COMMAND, () =>
      openIssue('feature', version, describeView(status.current)),
    ),
    vscode.commands.registerCommand(OPEN_REPOSITORY_COMMAND, () => openRepository()),
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

/** Checks the folders once and returns what the status bar should show. */
async function check(status: TrustStatus, log: vscode.LogOutputChannel): Promise<StatusView> {
  const { enabled, scope } = readSettings();
  if (!enabled) {
    return { kind: 'off' };
  }

  const binary = findClaudeBinary();
  if (!binary) {
    log.warn('The Claude Code extension is not installed on this machine; nothing to record.');
    return { kind: 'claudeCodeMissing', scope };
  }

  // An older CLI has no trust check to ask, so it is not run at all.
  const installed = claudeCodeVersion();
  if (installed !== undefined && isClaudeCodeTooOld(installed)) {
    log.warn(
      `Claude Code ${installed} is older than ${MIN_CLAUDE_CODE_VERSION} and cannot check folders; update the Claude Code extension. Nothing was recorded.`,
    );
    return { kind: 'claudeCodeTooOld', scope, version: installed };
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
  return { kind: 'done', scope, outcomes, at: new Date(), retrying: false };
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
    case 'claudeCodeTooOld':
      log.warn(`${outcome.folder}: ${outcome.error ?? 'the Claude Code extension is too old'}`);
      return;
    case 'failed':
      log.error(`${outcome.folder}: ${outcome.error ?? 'failed'}${outcome.reason ? ` [${outcome.reason}]` : ''}`);
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

async function showMenu(
  apply: () => Promise<void>,
  status: TrustStatus,
  log: vscode.LogOutputChannel,
  version: string,
): Promise<void> {
  const { enabled, scope } = readSettings();
  const lastCheck = describeView(status.current);
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
    // Offered only when it is the way out: an outdated Claude Code cannot be asked about trust.
    ...(needsClaudeCodeUpdate(status.current)
      ? [
          {
            label: `$(extensions) ${vscode.l10n.t('Update the Claude Code Extension')}`,
            detail: vscode.l10n.t('Opens its page, where the Update button is.'),
            run: openClaudeCodeExtension,
          } satisfies MenuItem,
        ]
      : []),
    { label: `$(refresh) ${vscode.l10n.t('Check Again Now')}`, run: apply } satisfies MenuItem,
    {
      label: `$(output) ${vscode.l10n.t('Show Log')}`,
      run: () => {
        log.show(true);
        return Promise.resolve();
      },
    } satisfies MenuItem,
    {
      label: `$(gear) ${vscode.l10n.t('Open Settings')}`,
      run: () =>
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          `@ext:moriyama-dev.vscode-claude-code-home-trust`,
        ),
    } satisfies MenuItem,
    separator(vscode.l10n.t('Feedback')),
    {
      label: `$(bug) ${vscode.l10n.t('Report an Issue')}`,
      run: () => openIssue('issue', version, lastCheck),
    } satisfies MenuItem,
    {
      label: `$(lightbulb) ${vscode.l10n.t('Request a Feature')}`,
      run: () => openIssue('feature', version, lastCheck),
    } satisfies MenuItem,
    { label: '$(github) GitHub', run: () => openRepository() } satisfies MenuItem,
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

/** Shows the Claude Code extension's own page; the Extensions view search is the fallback. */
async function openClaudeCodeExtension(): Promise<void> {
  try {
    await vscode.commands.executeCommand('extension.open', CLAUDE_CODE_EXTENSION_ID);
  } catch {
    await vscode.commands.executeCommand('workbench.extensions.search', `@id:${CLAUDE_CODE_EXTENSION_ID}`);
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
