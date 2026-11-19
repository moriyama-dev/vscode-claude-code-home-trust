# Trust Home Folder for Claude Code

English | [日本語](README.ja.md)

Stops the **"Trust this folder in Claude Code?"** dialog from coming back every time you open your home folder in VS Code.

Claude Code deliberately does not remember its answer for your home folder, so if you work with `~` open, it asks again in every new window. When you turn this extension on, it records the folder as trusted in Claude Code's own config file, the same record Claude Code writes when you trust any other folder, and the dialog no longer appears.

This extension is not made by or affiliated with Anthropic.

Found a problem or have an idea? [Open an issue on GitHub](https://github.com/moriyama-dev/vscode-claude-code-home-trust/issues).

## Before you turn it on

Trusting a folder lets Claude Code use that folder's `.claude/settings.json` and `.mcp.json`. Those files can run programs on your computer: hooks, environment variables, helper commands and MCP servers. Turn this on only if you created the folders it covers or know who did.

## Usage

1. Install the extension. **It does nothing until you turn it on.**
2. Click **Claude Trust: OFF** in the status bar and choose **ON**, or enable **Trust Home Folder for Claude Code › Enabled** in Settings.
3. The status bar shows **Claude Trust: ON**. Hover over it to see which folders were checked.

The same menu switches between **ON** and **OFF**, chooses which folders are covered, checks again and opens the settings.

The extension checks again when a window opens, when you change its settings, and when folders are added to the window.

## Settings

| Setting                       | Default      |                                                                                                             |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `claudeCodeHomeTrust.enabled` | `false`      | Record folders as trusted for Claude Code.                                                                  |
| `claudeCodeHomeTrust.scope`   | `homeFolder` | `homeFolder`: only your home folder. `openedFolders`: your home folder and every folder opened in a window. |

Both settings can be set only in user (or remote) settings, never in a workspace's `.vscode/settings.json`, so a folder you clone cannot trust itself.

With `openedFolders`, a folder inside a Git repository trusts the whole repository, as it does when you click **Trust folder** in Claude Code.

## How it works

- It asks the Claude Code CLI that ships with the Claude Code extension (`claude workspace-trust --json`) whether a folder is trusted, the same check the Claude Code extension runs before it shows the dialog.
- If the folder is not trusted, it sets `hasTrustDialogAccepted` to `true` for that folder in `~/.claude.json` (or `$CLAUDE_CONFIG_DIR/.claude.json`). It takes the same lock the CLI uses, changes only that one value, and then asks the CLI again to confirm.
- It never writes when the config file is missing or cannot be parsed, and it never removes a record. Turning the extension off stops new records but leaves existing ones in place; remove a record with the CLI or by editing the file if you want Claude Code to ask again.
- It runs where the Claude Code extension runs, including the remote side of Remote - SSH, WSL and dev containers. It does not use the network.

## Troubleshooting

Open **Output › Trust Home Folder for Claude Code** for a log of every check.

- **"the Claude Code extension was not found on this machine"**: install Claude Code in the same place this extension runs (for a remote window, on the remote side).
- **"Claude Code has not been set up yet"**: start Claude Code once, then click the status bar item and choose **Check Again Now**.
- **"not recorded"**: the log shows why, for example another process held the config file's lock. Choose **Check Again Now** to retry.

## Requirements

- VS Code 1.140 or later. For VSCodium, install it from [Open VSX](https://open-vsx.org/extension/moriyama-dev/vscode-claude-code-home-trust).
- The Claude Code extension

## License

[MIT](LICENSE)
