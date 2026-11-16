import * as assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ConfigLockBusyError, ConfigUnreadableError, configFilePath, markTrusted } from '../../src/core/config-file';

describe('configFilePath', () => {
  it('uses ~/.claude.json by default', () => {
    assert.equal(configFilePath({}, '/home/alex'), path.join('/home/alex', '.claude.json'));
  });

  it('follows CLAUDE_CONFIG_DIR like the CLI', () => {
    assert.equal(
      configFilePath({ CLAUDE_CONFIG_DIR: '/opt/claude' }, '/home/alex'),
      path.join('/opt/claude', '.claude.json'),
    );
  });
});

describe('markTrusted', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-trust-'));
    file = path.join(dir, '.claude.json');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const read = async (): Promise<Record<string, unknown>> =>
    JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;

  it('flips an existing entry and keeps everything else', async () => {
    const original = {
      numStartups: 7,
      oauthAccount: { emailAddress: 'someone@example.com' },
      projects: {
        '/home/alex': { allowedTools: ['Bash(ls)'], hasTrustDialogAccepted: false, lastCost: 1.5 },
        '/home/alex/work': { hasTrustDialogAccepted: true },
      },
    };
    await fs.writeFile(file, JSON.stringify(original, null, 2), { mode: 0o600 });

    assert.equal(await markTrusted(file, '/home/alex'), 'marked');

    const after = await read();
    assert.deepEqual(after.oauthAccount, original.oauthAccount);
    assert.equal(after.numStartups, 7);
    const projects = after.projects as Record<string, Record<string, unknown>>;
    assert.equal(projects['/home/alex'].hasTrustDialogAccepted, true);
    assert.deepEqual(projects['/home/alex'].allowedTools, ['Bash(ls)']);
    assert.equal(projects['/home/alex'].lastCost, 1.5);
    assert.deepEqual(projects['/home/alex/work'], { hasTrustDialogAccepted: true });
  });

  it('creates a full entry when the folder has none', async () => {
    await fs.writeFile(file, JSON.stringify({ projects: {} }));

    assert.equal(await markTrusted(file, '/srv/repo'), 'marked');

    const projects = (await read()).projects as Record<string, Record<string, unknown>>;
    assert.deepEqual(projects['/srv/repo'], {
      allowedTools: [],
      mcpContextUris: [],
      mcpServers: {},
      enabledMcpjsonServers: [],
      disabledMcpjsonServers: [],
      hasTrustDialogAccepted: true,
      hasClaudeMdExternalIncludesApproved: false,
      hasClaudeMdExternalIncludesWarningShown: false,
    });
  });

  it('creates the projects map when it is missing', async () => {
    await fs.writeFile(file, JSON.stringify({ numStartups: 1 }));

    assert.equal(await markTrusted(file, '/home/alex'), 'marked');

    const projects = (await read()).projects as Record<string, Record<string, unknown>>;
    assert.equal(projects['/home/alex'].hasTrustDialogAccepted, true);
  });

  it('leaves the file untouched when the folder is already trusted', async () => {
    const text = '{\n  "projects": {\n    "/home/alex": {\n      "hasTrustDialogAccepted": true\n    }\n  }\n}\n';
    await fs.writeFile(file, text);
    const before = await fs.stat(file);

    assert.equal(await markTrusted(file, '/home/alex'), 'alreadyTrusted');

    assert.equal(await fs.readFile(file, 'utf8'), text);
    assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
  });

  it('keeps the file mode and writes the CLI layout', async () => {
    await fs.writeFile(file, JSON.stringify({ projects: {} }), { mode: 0o600 });
    await fs.chmod(file, 0o600);

    await markTrusted(file, '/home/alex');

    const text = await fs.readFile(file, 'utf8');
    assert.ok(text.startsWith('{\n  "projects"'));
    assert.ok(!text.endsWith('\n'));
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    }
  });

  it('does nothing when the config file does not exist', async () => {
    assert.equal(await markTrusted(file, '/home/alex'), 'noConfigFile');
    await assert.rejects(fs.stat(file));
  });

  it('refuses to rewrite a file that does not parse', async () => {
    await fs.writeFile(file, '{ "projects": ');

    await assert.rejects(markTrusted(file, '/home/alex'), ConfigUnreadableError);
    assert.equal(await fs.readFile(file, 'utf8'), '{ "projects": ');
  });

  it('refuses when projects is not an object', async () => {
    await fs.writeFile(file, JSON.stringify({ projects: [] }));

    await assert.rejects(markTrusted(file, '/home/alex'), ConfigUnreadableError);
  });

  it('waits for the lock and gives up without touching the file', async () => {
    await fs.writeFile(file, JSON.stringify({ projects: {} }));
    await fs.mkdir(`${file}.lock`);

    await assert.rejects(
      markTrusted(file, '/home/alex', { lockTimeoutMs: 150, retryDelayMs: 20 }),
      ConfigLockBusyError,
    );

    assert.deepEqual(await read(), { projects: {} });
    // The other process's lock is left where it was.
    assert.ok((await fs.stat(`${file}.lock`)).isDirectory());
  });

  it('writes once the lock is released', async () => {
    await fs.writeFile(file, JSON.stringify({ projects: {} }));
    await fs.mkdir(`${file}.lock`);
    setTimeout(() => void fs.rmdir(`${file}.lock`), 100);

    assert.equal(await markTrusted(file, '/home/alex', { lockTimeoutMs: 2000, retryDelayMs: 20 }), 'marked');
  });

  it('releases the lock and leaves no temporary files', async () => {
    await fs.writeFile(file, JSON.stringify({ projects: {} }));

    await markTrusted(file, '/home/alex');

    assert.deepEqual(await fs.readdir(dir), ['.claude.json']);
  });
});
