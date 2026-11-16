import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'moriyama-dev.vscode-claude-code-home-trust';

describe('Trust Home Folder for Claude Code', () => {
  after(async () => {
    await vscode.workspace
      .getConfiguration('claudeCodeHomeTrust')
      .update('enabled', undefined, vscode.ConfigurationTarget.Global);
  });

  it('activates and registers its commands', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, 'extension is installed');
    await extension.activate();
    assert.equal(extension.isActive, true);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('claudeCodeHomeTrust.showMenu'));
    assert.ok(commands.includes('claudeCodeHomeTrust.toggle'));
  });

  it('is off until the user turns it on', () => {
    const config = vscode.workspace.getConfiguration('claudeCodeHomeTrust');
    assert.equal(config.get('enabled'), false);
    assert.equal(config.get('scope'), 'homeFolder');
  });

  it('keeps both settings out of workspace settings', () => {
    const config = vscode.workspace.getConfiguration('claudeCodeHomeTrust');
    // Machine-scoped settings ignore workspace values, so a cloned folder cannot turn this on for itself.
    assert.equal(config.inspect('enabled')?.workspaceValue, undefined);
    const packageJson = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as {
      contributes: { configuration: { properties: Record<string, { scope?: string }> } };
    };
    const properties = packageJson.contributes.configuration.properties;
    assert.equal(properties['claudeCodeHomeTrust.enabled'].scope, 'machine');
    assert.equal(properties['claudeCodeHomeTrust.scope'].scope, 'machine');
  });

  it('turns on and off with the toggle command', async () => {
    const config = () => vscode.workspace.getConfiguration('claudeCodeHomeTrust');
    await vscode.commands.executeCommand('claudeCodeHomeTrust.toggle');
    assert.equal(config().get('enabled'), true);
    await vscode.commands.executeCommand('claudeCodeHomeTrust.toggle');
    assert.equal(config().get('enabled'), false);
  });
});
