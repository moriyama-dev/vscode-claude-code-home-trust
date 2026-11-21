# Changelog

## 0.1.2 - 2026-11-21

- Show why a folder could not be recorded in the tooltip (the settings file is in use or unreadable, Claude Code did not answer, or Claude Code does not count the record), instead of only "not recorded".
- Recognize a Claude Code extension older than 2.1.323 from its version number, say that it needs an update and a window reload, and offer to open its page from the menu.
- Check again automatically after a few seconds, up to three times, when a folder could not be recorded.
- Add **Show Log**, **Report an Issue**, **Request a Feature** and **GitHub** to the status bar menu, and the three feedback commands to the Command Palette.

## 0.1.1 - 2026-11-17

- Support VS Code 1.140 and later, which also makes the extension available for VSCodium on Open VSX.

## 0.1.0 - 2026-11-16

Initial release.

- Record your home folder as trusted for Claude Code so its trust dialog stops appearing in every new window.
- Optionally record every folder opened in a window as well, after a confirmation.
- Off until you turn it on; both settings are machine-scoped, so a workspace cannot turn them on.
- Status bar item showing ON or OFF, with a menu to switch it, change the folders it covers and check again.
- Confirms each write with the Claude Code CLI and logs every check to an output channel.
- English and Japanese UI.
