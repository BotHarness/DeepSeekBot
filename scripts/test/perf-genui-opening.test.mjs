import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { genuiDirtySourceHashes } from '../perf-genui-provenance.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkBudget } from '../perf-budget.mjs';
import {
  genuiOpeningReady,
  observeGenuiOpening,
  summarizeGenuiOpening,
} from '../perf-genui-opening-observer.mjs';

const budget = JSON.parse(
  readFileSync(new URL('../perf-budgets/genui-opening.json', import.meta.url), 'utf8'),
);

const healthy = () => ({
  publications: Array.from({ length: 6 }, (_, index) => ({
    pair: Math.floor(index / 2) + 1,
    arm: index % 2 ? 'rich' : 'plain',
    publicationMs: 20,
    canonical: true,
    ...(index % 2 ? { previewMs: 1000, previewExact: true, previewDiagnostics: [] } : {}),
  })),
  openings: Array.from({ length: 6 }, (_, index) => ({
    pair: Math.floor(index / 2) + 1,
    arm: index % 2 ? 'rich' : 'plain',
    readyMs: index % 2 ? 200 : 100,
    trusted: true,
    canonicalVisible: true,
    controlsReady: true,
    iframeVisible: Boolean(index % 2),
    stable: true,
    previsited: false,
  })),
  pageErrors: [],
  cleanupFailures: [],
});

describe('dirty opening-run provenance', () => {
  it('hashes changed and untracked inputs without reading deleted source paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'genui-provenance-'));
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    try {
      git('init', '-q');
      writeFileSync(join(root, 'deleted.ts'), 'old source');
      writeFileSync(join(root, 'changed.json'), '{}');
      git('add', '.');
      git(
        '-c',
        'user.name=GenUI test',
        '-c',
        'user.email=genui@example.invalid',
        'commit',
        '-qm',
        'fixture',
      );
      rmSync(join(root, 'deleted.ts'));
      writeFileSync(join(root, 'changed.json'), '{"changed":true}');
      writeFileSync(join(root, 'new.mjs'), 'export const added = true;');
      const hash = (text) => createHash('sha256').update(text).digest('hex');
      expect(genuiDirtySourceHashes(root)).toEqual({
        'changed.json': hash('{"changed":true}'),
        'new.mjs': hash('export const added = true;'),
      });
      expect(git('diff', 'HEAD').toString()).toContain('deleted file mode');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('GenUI opening and added-work budget', () => {
  it('checks all three plain/rich pairs and retains signed added opening costs', () => {
    const summary = summarizeGenuiOpening(healthy());
    expect(checkBudget(summary, budget, { strictTiming: true }).pass).toBe(true);
    expect(summary.addedOpeningMs).toEqual([100, 100, 100]);
    expect(summary.rich.ready).toMatchObject({ medianMs: 200, minMs: 200, maxMs: 200 });
  });

  it('does not turn a faster rich sample into a zero-cost or speed advantage claim', () => {
    const input = healthy();
    input.openings[1].readyMs = 50;
    expect(summarizeGenuiOpening(input).addedOpeningMs).toEqual([-50, 100, 100]);
  });

  it.each([
    ['previewMs', 15_001, 'preview.maxMs'],
    ['publicationMs', 1001, 'publication.maxMs'],
  ])('fails a single %s outlier rather than replacing it with a median', (field, value, metric) => {
    const input = healthy();
    input.publications[1][field] = value;
    const result = checkBudget(summarizeGenuiOpening(input), budget, { strictTiming: true });
    expect(result.pass).toBe(false);
    expect(result.failures.map((failure) => failure.metric)).toContain(metric);
  });

  it('fails any rich opening above the frozen total-readiness deadline', () => {
    const input = healthy();
    input.openings[5].readyMs = 1501;
    expect(checkBudget(summarizeGenuiOpening(input), budget, { strictTiming: true }).pass).toBe(
      false,
    );
  });

  it.each(['trusted', 'canonicalVisible', 'controlsReady', 'iframeVisible', 'stable'])(
    'rejects missing %s readiness evidence',
    (field) => {
      const input = healthy();
      input.openings[1][field] = false;
      expect(checkBudget(summarizeGenuiOpening(input), budget, { strictTiming: true }).pass).toBe(
        false,
      );
    },
  );

  it.each([NaN, Infinity, -1, undefined])('rejects invalid elapsed time %s', (value) => {
    const input = healthy();
    input.openings[1].readyMs = value;
    expect(checkBudget(summarizeGenuiOpening(input), budget, { strictTiming: true }).pass).toBe(
      false,
    );
  });

  it.each([
    'trusted',
    'canonicalVisible',
    'controlsReady',
    'iframeVisible',
    'stable',
    'previsited',
  ])('requires explicit %s evidence rather than absent flags', (field) => {
    const input = healthy();
    delete input.openings[1][field];
    expect(checkBudget(summarizeGenuiOpening(input), budget, { strictTiming: true }).pass).toBe(
      false,
    );
  });

  it('rejects duplicate/missing pairs, previsited targets, preview mismatches and cleanup failures', () => {
    for (const change of [
      (input) => {
        input.openings[5].pair = 2;
      },
      (input) => {
        input.openings.pop();
      },
      (input) => {
        input.openings[1].previsited = true;
      },
      (input) => {
        input.publications[1].previewExact = false;
      },
      (input) => {
        input.cleanupFailures.push('Bot remained running');
      },
      (input) => {
        input.pageErrors.push('uncaught');
      },
    ]) {
      const input = healthy();
      change(input);
      expect(checkBudget(summarizeGenuiOpening(input), budget, { strictTiming: true }).pass).toBe(
        false,
      );
    }
  });
});

describe('opening observer cleanup', () => {
  const target = { messageId: 'test', channelId: 'dm-test', previsited: false };
  it('disposes its remote handle and removes its listener after a successful observation', async () => {
    const ready = { readyMs: 10, viewport: { innerWidth: 100 } };
    const handle = { jsonValue: vi.fn().mockResolvedValue(ready), dispose: vi.fn() };
    const page = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(ready)
        .mockResolvedValueOnce(undefined),
      waitForFunction: vi.fn().mockResolvedValue(handle),
    };
    const open = vi.fn();
    await expect(observeGenuiOpening(page, target, open)).resolves.toMatchObject({ stable: true });
    expect(open).toHaveBeenCalledOnce();
    expect(handle.dispose).toHaveBeenCalledOnce();
    expect(page.evaluate).toHaveBeenCalledTimes(4);
  });

  it('retains the primary opening failure and its cleanup failure separately', async () => {
    const failure = new Error('opening failed');
    const page = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('cleanup failed')),
    };
    await expect(
      observeGenuiOpening(page, target, () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(failure.cleanupFailure).toContain('cleanup failed');
  });
});

describe('observable canonical opening readiness', () => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = () => {
    const bounds = { left: 20, top: 20, right: 700, bottom: 700 };
    const pane = { getBoundingClientRect: () => bounds };
    const button = { textContent: 'Continue', disabled: false };
    const iframe = {
      checkVisibility: () => true,
      getBoundingClientRect: () => bounds,
      closest: () => pane,
      contains: (node) => node === iframe,
    };
    const section = {
      querySelector: () => iframe,
      querySelectorAll: () => [button],
    };
    const message = {
      checkVisibility: () => true,
      getBoundingClientRect: () => bounds,
      closest: () => pane,
      contains: (node) => node === iframe,
      querySelector: () => section,
    };
    const document = {
      visibilityState: 'visible',
      hasFocus: () => true,
      querySelector: (selector) =>
        selector.includes('data-message-id')
          ? message
          : selector.includes('contenteditable')
            ? {}
            : null,
      elementFromPoint: () => iframe,
    };
    const state = { clickedAt: 100, trusted: true, previsited: false };
    vi.stubGlobal('window', { __bhGenuiOpening: state });
    vi.stubGlobal('document', document);
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal('performance', { now: () => 200 });
    return { message, button, iframe, document, state };
  };
  const target = { messageId: 'canonical', rich: true, continueLabel: 'Continue' };

  it('requires a visibly frontmost canonical message and visible ready iframe', () => {
    setup();
    expect(genuiOpeningReady(target)).toMatchObject({
      readyMs: 100,
      canonicalVisible: true,
      iframeVisible: true,
    });
  });
  it.each(['disabled', 'hidden-frame', 'offscreen', 'overlay', 'unfocused'])(
    'does not count %s content as ready',
    (mode) => {
      const fixture = setup();
      if (mode === 'disabled') fixture.button.disabled = true;
      if (mode === 'hidden-frame') fixture.iframe.checkVisibility = () => false;
      if (mode === 'offscreen')
        fixture.message.getBoundingClientRect = () => ({
          left: 20,
          right: 700,
          top: 900,
          bottom: 1600,
        });
      if (mode === 'overlay') fixture.document.elementFromPoint = () => ({});
      if (mode === 'unfocused') fixture.document.hasFocus = () => false;
      expect(genuiOpeningReady(target)).toBe(null);
    },
  );
  it('refuses untrusted clicks and already rendered targets', () => {
    const fixture = setup();
    fixture.state.trusted = false;
    expect(genuiOpeningReady(target)).toHaveProperty('error');
    fixture.state.trusted = true;
    fixture.state.previsited = true;
    expect(genuiOpeningReady(target)).toHaveProperty('error');
  });
});
