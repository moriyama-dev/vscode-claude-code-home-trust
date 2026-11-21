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

The same menu switches between **ON** and **OFF**, chooses which folders are covered, checks again, shows the log and opens the settings. It also has the feedback links described under [Commands](#commands).

The extension checks again when a window opens, when you change its settings, and when folders are added to the window. If a folder could not be recorded, it tries again by itself after a few seconds, up to three times.

## Settings

| Setting                       | Default      |                                                                                                             |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `claudeCodeHomeTrust.enabled` | `false`      | Record folders as trusted for Claude Code.                                                                  |
| `claudeCodeHomeTrust.scope`   | `homeFolder` | `homeFolder`: only your home folder. `openedFolders`: your home folder and every folder opened in a window. |

Both settings can be set only in user (or remote) settings, never in a workspace's `.vscode/settings.json`, so a folder you clone cannot trust itself.

With `openedFolders`, a folder inside a Git repository trusts the whole repository, as it does when you click **Trust folder** in Claude Code.

## Commands

All of them are in the Command Palette under **Claude Code Trust**.

| Command               |                                                                                |
| --------------------- | ------------------------------------------------------------------------------ |
| **Show Menu**         | Open the same menu as a click on the status bar item.                          |
| **Turn On or Off**    | Switch the extension on or off.                                                |
| **Report an Issue**   | Open a new GitHub issue with the versions and your platform already filled in. |
| **Request a Feature** | Open a new GitHub issue for an idea.                                           |
| **Open on GitHub**    | Open the repository.                                                           |

The three feedback commands are also at the bottom of the status bar menu. Nothing is sent until you submit the issue on GitHub, and the pre-filled text holds only version numbers, the operating system, the UI language, the date and the result of the last check as state names, never a folder path.

## How it works

- It asks the Claude Code CLI that ships with the Claude Code extension (`claude workspace-trust --json`) whether a folder is trusted, the same check the Claude Code extension runs before it shows the dialog.
- If the folder is not trusted, it sets `hasTrustDialogAccepted` to `true` for that folder in `~/.claude.json` (or `$CLAUDE_CONFIG_DIR/.claude.json`). It takes the same lock the CLI uses, changes only that one value, and then asks the CLI again to confirm.
- It never writes when the config file is missing or cannot be parsed, and it never removes a record. Turning the extension off stops new records but leaves existing ones in place; remove a record with the CLI or by editing the file if you want Claude Code to ask again.
- It runs where the Claude Code extension runs, including the remote side of Remote - SSH, WSL and dev containers. It does not use the network.

## Troubleshooting

Hover over the status bar item to see the result for each folder, with the reason when one could not be recorded. For a log of every check, click the item and choose **Show Log**, or open **Output › Trust Home Folder for Claude Code**.

- **"the Claude Code extension was not found on this machine"**: install Claude Code in the same place this extension runs (for a remote window, on the remote side).
- **"Claude Code has not been set up yet"**: start Claude Code once, then click the status bar item and choose **Check Again Now**.
- **"Claude Code … is too old to check folders"**: the trust check this extension relies on arrived in Claude Code 2.1.323. Click the status bar item and choose **Update the Claude Code Extension**, update it in the same place this extension runs (for a remote window, on the remote side, which updates separately from your own computer), then choose **Check Again Now**.
- **"not recorded: another program is using the Claude Code settings file"**: something else held the lock on `~/.claude.json` for several seconds. The extension tries again by itself. If it stays, look for a leftover `~/.claude.json.lock` folder while no Claude Code is running.
- **"not recorded: the Claude Code settings file could not be read"**: `~/.claude.json` is not the JSON object Claude Code writes, so nothing was written. Run `claude` in a terminal; it says what is wrong with the file.
- **"not recorded: Claude Code did not answer in time"**: the CLI took more than 20 seconds. The extension tries again by itself.
- **"recorded, but Claude Code still reports the folder as not trusted"**: the record is in the file, but Claude Code does not count it. This happens when the environment variable `CLAUDE_CODE_IGNORE_PERSISTED_TRUST` is set where VS Code runs: Claude Code then ignores every trust record.
- **"not recorded: …"** with any other text: the text is the error itself, and the log has the full message.

## Requirements

- VS Code 1.140 or later. For VSCodium, install it from [Open VSX](https://open-vsx.org/extension/moriyama-dev/vscode-claude-code-home-trust).
- The Claude Code extension, 2.1.323 or later

## License

[MIT](LICENSE)
