import * as assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  ClaudeCodeTooOldError,
  TrustCheckTimeoutError,
  isClaudeCodeTooOld,
  parseTrustReport,
  readTrustReport,
} from '../../src/core/trust-report';

describe('isClaudeCodeTooOld', () => {
  it('is true before the first release with the trust check', () => {
    assert.equal(isClaudeCodeTooOld('2.1.322'), true);
    assert.equal(isClaudeCodeTooOld('2.1.99'), true);
    assert.equal(isClaudeCodeTooOld('2.0.999'), true);
    assert.equal(isClaudeCodeTooOld('1.9.999'), true);
  });

  it('is false from that release on', () => {
    assert.equal(isClaudeCodeTooOld('2.1.323'), false);
    assert.equal(isClaudeCodeTooOld('2.1.329'), false);
    assert.equal(isClaudeCodeTooOld('2.2.0'), false);
    assert.equal(isClaudeCodeTooOld('3.0.0'), false);
    assert.equal(isClaudeCodeTooOld('2.1.323-beta.1'), false);
  });

  it('leaves a version it cannot read to the CLI', () => {
    assert.equal(isClaudeCodeTooOld(undefined), false);
    assert.equal(isClaudeCodeTooOld(''), false);
    assert.equal(isClaudeCodeTooOld('latest'), false);
  });
});

describe('parseTrustReport', () => {
  it('reads a plain folder', () => {
    assert.deepEqual(parseTrustReport('{"trusted":false,"directory":"/home/alex","sandbox_limits_files":false}\n'), {
      trusted: false,
      directory: '/home/alex',
      root: undefined,
      unsafePath: false,
    });
  });

  it('reads the repository root', () => {
    const report = parseTrustReport(
      '{"trusted":true,"directory":"/srv/repo/src","root":"/srv/repo","sandbox_limits_files":false}',
    );
    assert.equal(report.trusted, true);
    assert.equal(report.root, '/srv/repo');
  });

  it('reads an unsafe path', () => {
    assert.equal(parseTrustReport('{"trusted":false,"directory":"/x","unsafe_path":true}').unsafePath, true);
  });

  it('skips lines printed before the JSON', () => {
    assert.equal(parseTrustReport('warning: something\n{"trusted":true,"directory":"/x"}\n').trusted, true);
  });

  it('rejects output without a report', () => {
    assert.throws(() => parseTrustReport('Not logged in'));
    assert.throws(() => parseTrustReport('{"directory":"/x"}'));
  });
});

describe('readTrustReport', { skip: process.platform === 'win32' }, () => {
  it('runs the program in the folder and parses what it prints', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-trust-bin-'));
    try {
      const fake = path.join(dir, 'claude');
      await fs.writeFile(
        fake,
        '#!/bin/sh\n[ "$1 $2" = "workspace-trust --json" ] || exit 2\nprintf \'{"trusted":true,"directory":"%s"}\\n\' "$PWD"\n',
        { mode: 0o755 },
      );
      const report = await readTrustReport(fake, dir);
      assert.equal(report.trusted, true);
      assert.equal(report.directory, await fs.realpath(dir));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('says Claude Code is too old when it does not know the command', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-trust-bin-'));
    try {
      const fake = path.join(dir, 'claude');
      await fs.writeFile(fake, '#!/bin/sh\necho "error: unknown option \'--json\'" >&2\nexit 1\n', { mode: 0o755 });
      await assert.rejects(readTrustReport(fake, dir), ClaudeCodeTooOldError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('says so when the program does not answer in time', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-trust-bin-'));
    try {
      const fake = path.join(dir, 'claude');
      await fs.writeFile(fake, '#!/bin/sh\nexec sleep 5\n', { mode: 0o755 });
      await assert.rejects(readTrustReport(fake, dir, 200), TrustCheckTimeoutError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects when the program fails', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-trust-bin-'));
    try {
      const fake = path.join(dir, 'claude');
      await fs.writeFile(fake, '#!/bin/sh\necho "config is broken" >&2\nexit 1\n', { mode: 0o755 });
      await assert.rejects(readTrustReport(fake, dir), /config is broken/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
