import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';
import { BrowserProvisionError } from '../../browser/src/runtime/provision.js';

const packagedRuntime = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/runtime/genui-runtime-source.js', () => ({
  loadGenuiRuntimeSource: packagedRuntime.load,
}));

const runtime = vi.hoisted(() => ({
  binary: '/synthetic/chrome' as string | undefined,
  directory: '',
  browserPath: '',
  ensure: vi.fn<() => Promise<void>>(),
  stop: vi.fn<() => Promise<void>>(),
  send: vi.fn(),
  event: vi.fn<(detail: string) => void>(),
  rmFailure: undefined as Error | undefined,
}));

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (runtime.rmFailure) throw runtime.rmFailure;
      return actual.rm(...args);
    },
  };
});

vi.mock('../../browser/src/runtime/browser.js', () => ({
  discoverBrowserBinary: () => runtime.binary,
  connectCdp: async () => ({ send: runtime.send }),
  createBotBrowserRuntime: (options: {
    userDataDir: string;
    browserPath: string;
    onEvent?: (detail: string) => void;
    connect: (endpoint: string) => Promise<unknown>;
  }) => {
    runtime.directory = options.userDataDir;
    runtime.browserPath = options.browserPath;
    runtime.event.mockImplementation(options.onEvent ?? (() => {}));
    return {
      ensure: async () => {
        options.onEvent?.('launch /private/browser mode=headless');
        await runtime.ensure();
        await options.connect('ws://synthetic');
      },
      stop: runtime.stop,
    };
  },
}));

import {
  previewGenuiDocument,
  recordGenuiPreviewDiagnostic,
} from '../src/runtime/genui-preview.js';
import { diagnosticEventRecorder } from '../src/diagnostics/diagnostic-log.js';
import type { LogEntryInput } from '../src/logs/log-db.js';

beforeEach(async () => {
  runtime.rmFailure = undefined;
  const { createHash } = await import('node:crypto');
  const source = 'globalThis.__BotHarnessGenuiRuntime = {};';
  packagedRuntime.load.mockResolvedValue({
    source,
    sha256: createHash('sha256').update(source).digest('hex'),
  });
  runtime.binary = '/synthetic/chrome';
  runtime.ensure.mockResolvedValue();
  runtime.stop.mockResolvedValue();
  runtime.send.mockImplementation(async (method: string) => {
    if (method === 'Target.getTargets')
      return { targetInfos: [{ targetId: 'target', type: 'page' }] };
    if (method === 'Target.attachToTarget') return { sessionId: 'session' };
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame' } } };
    if (method === 'Runtime.evaluate')
      return {
        result: {
          value: { ready: true, measured: true, height: 48, diagnostics: [] },
        },
      };
    if (method === 'Page.captureScreenshot') return { data: 'c3ludGhldGlj' };
    return {};
  });
});

afterEach(() => vi.clearAllMocks());

describe('isolated GenUI preview lifecycle', () => {
  it('keeps Browser owner ready and stop events in their actual phases', async () => {
    runtime.ensure.mockImplementation(async () => {
      runtime.event('ready');
    });
    runtime.stop.mockImplementation(async () => {
      runtime.event('stopped');
    });
    const onDiagnostic = vi.fn();
    await previewGenuiDocument(syntheticGenuiDocument, { onDiagnostic });
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'ready', detail: 'ready' }),
    );
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'stopped', detail: 'stopped' }),
    );
    expect(
      onDiagnostic.mock.calls.some(
        ([event]) => event.phase === 'starting' && ['ready', 'stopped'].includes(event.detail),
      ),
    ).toBe(false);
  });
  it('preserves safe startup metadata through the bounded DiagnosticEvents owner', () => {
    const rows: LogEntryInput[] = [];
    const log = diagnosticEventRecorder((entries) => rows.push(...entries));
    recordGenuiPreviewDiagnostic(log, {
      phase: 'refused',
      durationMs: 8000,
      reason: 'genui-preview-browser-startup-timeout',
      detail: JSON.stringify({
        pid: 1234,
        stderr:
          'failure '.repeat(250) +
          'final-cause token=keep-private https://example.com/?token=hidden',
      }),
    });
    expect(rows[0]).toMatchObject({ plugin: 'genui-preview', kind: 'refused' });
    const detail = rows
      .slice(1)
      .map((row) => JSON.parse(row.detail).text)
      .join('');
    expect(detail).toContain('1234');
    expect(detail).toContain('final-cause');
    expect(detail).not.toMatch(/keep-private|hidden/);
    expect(rows.length).toBeLessThanOrEqual(17);
    for (const row of rows) expect(row.detail.length).toBeLessThanOrEqual(4000);
  });
  it('uses an explicitly configured executable in the same Browser runtime', async () => {
    await previewGenuiDocument(syntheticGenuiDocument, { browserPath: process.execPath });
    expect(runtime.browserPath).toBe(process.execPath);
  });

  it.each(['relative/chrome', '/missing-preview-browser', import.meta.dirname])(
    'refuses invalid explicit executable %s without system fallback',
    async (browserPath) => {
      await expect(
        previewGenuiDocument(syntheticGenuiDocument, { browserPath }),
      ).rejects.toMatchObject({ code: 'genui-preview-browser-invalid-path' });
      expect(runtime.ensure).not.toHaveBeenCalled();
    },
  );
  it('refuses missing or changed runtime assets before starting a browser and releases the owner', async () => {
    packagedRuntime.load.mockRejectedValueOnce(new Error('Missing asset'));
    await expect(previewGenuiDocument(syntheticGenuiDocument)).rejects.toMatchObject({
      code: 'genui-preview-assets-failed',
    });
    expect(runtime.ensure).not.toHaveBeenCalled();
    packagedRuntime.load.mockResolvedValueOnce({
      source: 'changed',
      sha256: '0'.repeat(64),
    });
    await expect(previewGenuiDocument(syntheticGenuiDocument)).rejects.toMatchObject({
      code: 'genui-preview-document-failed',
    });
    await expect(previewGenuiDocument(syntheticGenuiDocument)).resolves.toMatchObject({
      height: 48,
    });
  });

  it.each([
    'memory',
    'execution',
    'startup',
    'resource',
    'invalid-content',
    'unsupported',
    'private-detail',
  ])('stops promptly with a bounded renderer refusal: %s', async (failure) => {
    const previous = runtime.send.getMockImplementation()!;
    runtime.send.mockImplementation(async (method: string, ...args: unknown[]) =>
      method === 'Runtime.evaluate'
        ? {
            result: {
              value: {
                ready: false,
                measured: false,
                failed: true,
                failure,
                height: 48,
                diagnostics: ['Refused'],
              },
            },
          }
        : previous(method, ...args),
    );
    await expect(previewGenuiDocument(syntheticGenuiDocument)).rejects.toMatchObject({
      code: `genui-preview-renderer-${failure === 'private-detail' ? 'unsupported' : failure}`,
    });
    expect(
      runtime.send.mock.calls.filter(([method]) => method === 'Runtime.evaluate'),
    ).toHaveLength(1);
    expect(runtime.stop).toHaveBeenCalledOnce();
  });
  it('returns a tiny document preview and removes its disposable profile after stopping', async () => {
    runtime.stop.mockImplementationOnce(async () => {
      expect(existsSync(runtime.directory)).toBe(true);
      expect(runtime.send).toHaveBeenCalledWith('Browser.close');
    });
    const result = await previewGenuiDocument(syntheticGenuiDocument, {
      width: 390,
    });
    expect(result).toMatchObject({
      width: 390,
      height: 48,
      screenshot: { mimeType: 'image/png' },
    });
    const methods = runtime.send.mock.calls.map(([method]) => method as string);
    expect(methods).not.toContain('Target.createTarget');
    expect(runtime.send).toHaveBeenCalledWith('Target.attachToTarget', {
      targetId: 'target',
      flatten: true,
    });
    const frameWait = runtime.send.mock.calls.findIndex(
      ([method, params]) =>
        method === 'Runtime.evaluate' &&
        (params as { awaitPromise?: boolean }).awaitPromise === true,
    );
    expect(frameWait).toBeGreaterThan(-1);
    expect(frameWait).toBeLessThan(methods.indexOf('Page.captureScreenshot'));
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(existsSync(runtime.directory)).toBe(false);
  });

  it('refuses unavailable browsers and invalid dimensions without starting a browser', async () => {
    await expect(
      previewGenuiDocument(syntheticGenuiDocument, { width: 239 }),
    ).rejects.toMatchObject({ code: 'invalid-genui-preview' });
    runtime.binary = undefined;
    await expect(previewGenuiDocument(syntheticGenuiDocument)).rejects.toMatchObject({
      code: 'genui-preview-unavailable',
    });
    expect(runtime.ensure).not.toHaveBeenCalled();
  });

  it('cleans up failed browser startup before accepting another preview', async () => {
    runtime.ensure.mockRejectedValueOnce(new Error('Synthetic launch failure'));
    await expect(previewGenuiDocument(syntheticGenuiDocument)).rejects.toMatchObject({
      code: 'genui-preview-browser-failed',
    });
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(existsSync(runtime.directory)).toBe(false);
    await expect(previewGenuiDocument(syntheticGenuiDocument)).resolves.toMatchObject({
      height: 48,
    });
  });

  it('retains a safe Browser owner failure kind without process stderr or private paths', async () => {
    runtime.ensure.mockRejectedValueOnce(
      new BrowserProvisionError('startup-timeout', 'private browser detail', '/private/profile'),
    );
    const onDiagnostic = vi.fn();
    await expect(
      previewGenuiDocument(syntheticGenuiDocument, { onDiagnostic }),
    ).rejects.toMatchObject({
      code: 'genui-preview-browser-startup-timeout',
      message: 'The isolated preview browser could not start.',
    });
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'refused',
        reason: 'genui-preview-browser-startup-timeout',
      }),
    );
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private');
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(existsSync(runtime.directory)).toBe(false);
  });

  it('refuses concurrent work, cancels an active preview, and releases the owner', async () => {
    const controller = new AbortController();
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    runtime.ensure.mockReturnValueOnce(pending);
    const first = previewGenuiDocument(syntheticGenuiDocument, {
      signal: controller.signal,
    });
    const rejected = expect(first).rejects.toMatchObject({
      code: 'genui-preview-timeout',
    });
    await vi.waitFor(() => expect(runtime.ensure).toHaveBeenCalledOnce());
    await expect(previewGenuiDocument(syntheticGenuiDocument)).rejects.toMatchObject({
      code: 'genui-preview-busy',
    });
    controller.abort();
    release();
    await rejected;
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(existsSync(runtime.directory)).toBe(false);
  });

  it('rejects an oversized image and still stops its browser', async () => {
    const previous = runtime.send.getMockImplementation()!;
    runtime.send.mockImplementation(async (method: string, ...args: unknown[]) =>
      method === 'Page.captureScreenshot'
        ? { data: 'x'.repeat(1_398_105) }
        : previous(method, ...args),
    );
    await expect(previewGenuiDocument(syntheticGenuiDocument)).rejects.toMatchObject({
      code: 'genui-preview-too-large',
    });
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(existsSync(runtime.directory)).toBe(false);
  });

  it.each([false, true])(
    'classifies failed cleanup without erasing a prior refusal: %s',
    async (refused) => {
      if (refused) runtime.ensure.mockRejectedValueOnce(new Error('private launch detail'));
      runtime.stop.mockRejectedValueOnce(new Error('private cleanup detail'));
      const onDiagnostic = vi.fn();
      try {
        await expect(
          previewGenuiDocument(syntheticGenuiDocument, { onDiagnostic }),
        ).rejects.toMatchObject({
          code: 'genui-preview-cleanup-browser-failed',
          message: refused
            ? 'Preview browser cleanup failed after genui-preview-browser-failed.'
            : 'Preview browser cleanup failed.',
        });
        const reasons = onDiagnostic.mock.calls.map(([event]) => event.reason).filter(Boolean);
        expect(reasons).toEqual([
          ...(refused ? ['genui-preview-browser-failed'] : []),
          'genui-preview-cleanup-browser-failed',
        ]);
        expect(onDiagnostic.mock.calls.some(([event]) => event.phase === 'stopped')).toBe(false);
        expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private');
        expect(existsSync(runtime.directory)).toBe(true);
      } finally {
        await rm(runtime.directory, { recursive: true, force: true });
      }
    },
  );
});
