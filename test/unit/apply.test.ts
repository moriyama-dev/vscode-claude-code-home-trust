import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureTrusted, foldersFor, hasFailure, parseScope, type ApplyDeps } from '../../src/core/apply';
import type { MarkResult } from '../../src/core/config-file';
import type { TrustReport } from '../../src/core/trust-report';

/** A stand-in for the CLI and the config file: trust is a set of record keys. */
function fakeClaude(
  trustedKeys: string[],
  options: { roots?: Record<string, string>; unsafe?: string[]; noConfig?: boolean; ignoreWrites?: boolean } = {},
) {
  const trusted = new Set(trustedKeys);
  const marked: string[] = [];
  const deps: ApplyDeps = {
    report(folder): Promise<TrustReport> {
      const root = options.roots?.[folder];
      return Promise.resolve({
        trusted: trusted.has(root ?? folder),
        directory: folder,
        root,
        unsafePath: options.unsafe?.includes(folder) ?? false,
      });
    },
    mark(key): Promise<MarkResult> {
      if (options.noConfig) {
        return Promise.resolve('noConfigFile');
      }
      marked.push(key);
      if (!options.ignoreWrites) {
        trusted.add(key);
      }
      return Promise.resolve('marked');
    },
  };
  return { deps, marked };
}

describe('foldersFor', () => {
  it('only returns the home folder for the home scope', () => {
    assert.deepEqual(foldersFor('homeFolder', '/home/alex', ['/home/alex/work']), ['/home/alex']);
  });

  it('adds every opened folder for the opened-folders scope, without duplicates', () => {
    assert.deepEqual(foldersFor('openedFolders', '/home/alex', ['/home/alex', '/srv/repo']), [
      '/home/alex',
      '/srv/repo',
    ]);
  });
});

describe('parseScope', () => {
  it('falls back to the home scope for anything unexpected', () => {
    assert.equal(parseScope('openedFolders'), 'openedFolders');
    assert.equal(parseScope('homeFolder'), 'homeFolder');
    assert.equal(parseScope('everything'), 'homeFolder');
    assert.equal(parseScope(undefined), 'homeFolder');
  });
});

describe('ensureTrusted', () => {
  it('does not write when Claude Code already trusts the folder', async () => {
    const { deps, marked } = fakeClaude(['/home/alex']);
    assert.deepEqual(await ensureTrusted(['/home/alex'], deps), [{ folder: '/home/alex', state: 'alreadyTrusted' }]);
    assert.deepEqual(marked, []);
  });

  it('records the folder and confirms with Claude Code', async () => {
    const { deps, marked } = fakeClaude([]);
    assert.deepEqual(await ensureTrusted(['/home/alex'], deps), [{ folder: '/home/alex', state: 'marked' }]);
    assert.deepEqual(marked, ['/home/alex']);
  });

  it('records the repository root that Claude Code names', async () => {
    const { deps, marked } = fakeClaude([], { roots: { '/srv/repo/src': '/srv/repo' } });
    const outcomes = await ensureTrusted(['/srv/repo/src'], deps);
    assert.equal(outcomes[0].state, 'marked');
    assert.deepEqual(marked, ['/srv/repo']);
  });

  it('never records a path Claude Code calls unsafe', async () => {
    const { deps, marked } = fakeClaude([], { unsafe: ['/home/alex/odd​name'] });
    const outcomes = await ensureTrusted(['/home/alex/odd​name'], deps);
    assert.equal(outcomes[0].state, 'unsafePath');
    assert.deepEqual(marked, []);
    assert.equal(hasFailure(outcomes), true);
  });

  it('reports a missing config file without failing', async () => {
    const { deps } = fakeClaude([], { noConfig: true });
    const outcomes = await ensureTrusted(['/home/alex'], deps);
    assert.equal(outcomes[0].state, 'noConfigFile');
    assert.equal(hasFailure(outcomes), false);
  });

  it('fails when Claude Code still disagrees after the write', async () => {
    const { deps } = fakeClaude([], { ignoreWrites: true });
    const outcomes = await ensureTrusted(['/home/alex'], deps);
    assert.equal(outcomes[0].state, 'failed');
    assert.equal(hasFailure(outcomes), true);
  });

  it('keeps going after one folder fails', async () => {
    const { deps } = fakeClaude([]);
    const failing: ApplyDeps = {
      report: (folder) => (folder === '/broken' ? Promise.reject(new Error('spawn ENOENT')) : deps.report(folder)),
      mark: (key) => deps.mark(key),
    };
    const outcomes = await ensureTrusted(['/broken', '/home/alex'], failing);
    assert.deepEqual(outcomes, [
      { folder: '/broken', state: 'failed', error: 'spawn ENOENT' },
      { folder: '/home/alex', state: 'marked' },
    ]);
  });
});
