import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REPOSITORY_URL, buildIssueUrl, torontoTimestamp, type FeedbackEnvironment } from '../../src/core/feedback';

const env: FeedbackEnvironment = {
  extensionVersion: '0.1.2',
  claudeCodeVersion: '2.1.329',
  editor: 'Visual Studio Code 1.144.0',
  os: 'Linux 6.8.0 (x64)',
  remote: 'ssh-remote',
  language: 'ja',
  lastCheck: 'failed (lockBusy)',
};
const headings = { first: 'What happened', second: 'What I expected' };
const now = new Date('2026-11-20T15:30:00Z');

function bodyOf(url: string): string {
  return new URL(url).searchParams.get('body') ?? '';
}

describe('torontoTimestamp', () => {
  it('converts to Toronto local time', () => {
    assert.equal(torontoTimestamp(now), '2026-11-20 10:30 (America/Toronto)');
    assert.equal(torontoTimestamp(new Date('2026-07-01T15:30:00Z')), '2026-07-01 11:30 (America/Toronto)');
  });
});

describe('buildIssueUrl', () => {
  it('opens a new issue in the repository with the environment filled in', () => {
    const url = buildIssueUrl('issue', headings, env, now);
    assert.ok(url.startsWith(`${REPOSITORY_URL}/issues/new?`));
    const body = bodyOf(url);
    assert.match(body, /^## What happened\n/);
    assert.match(body, /## What I expected/);
    assert.match(body, /- Trust Home Folder for Claude Code: 0\.1\.2/);
    assert.match(body, /- Claude Code extension: 2\.1\.329/);
    assert.match(body, /- Last check: failed \(lockBusy\)/);
    assert.match(body, /- Editor: Visual Studio Code 1\.144\.0/);
    assert.match(body, /- OS: Linux 6\.8\.0 \(x64\)/);
    assert.match(body, /- Remote: ssh-remote/);
    assert.match(body, /- UI language: ja/);
    assert.match(body, /- Date: 2026-11-20 10:30 \(America\/Toronto\)/);
  });

  it('labels a feature request and uses its own headings', () => {
    const url = buildIssueUrl('feature', { first: 'What I would like', second: 'What it would make easier' }, env, now);
    assert.equal(new URL(url).searchParams.get('labels'), 'enhancement');
    assert.match(bodyOf(url), /^## What I would like\n/);
    assert.equal(new URL(buildIssueUrl('issue', headings, env, now)).searchParams.get('labels'), null);
  });

  it('says so when Claude Code is missing and there is no remote', () => {
    const body = bodyOf(
      buildIssueUrl('issue', headings, { ...env, claudeCodeVersion: undefined, remote: undefined }, now),
    );
    assert.match(body, /- Claude Code extension: not installed/);
    assert.match(body, /- Remote: none/);
  });
});
