import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';

/**
 * The CLI that ships inside the Claude Code extension. It is the same program
 * the extension asks before showing its trust dialog, so its answer is the one
 * that matters.
 */
export function findClaudeBinary(): string | undefined {
  const extension = vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID);
  if (!extension) {
    return undefined;
  }
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const binary = path.join(extension.extensionPath, 'resources', 'native-binary', name);
  return existsSync(binary) ? binary : undefined;
}
