import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';

const runtime = vi.hoisted(() => ({
  binary: '/synthetic/chrome' as string | undefined,
  directory: '',
  ensure: vi.fn<() => Promise<void>>(),
  stop: vi.fn<() => Promise<void>>(),
  send: vi.fn(),
}));

vi.mock('../../browser/src/runtime/browser.js', () => ({
  discoverBrowserBinary: () => runtime.binary,
  connectCdp: async () => ({ send: runtime.send }),
  createBotBrowserRuntime: (options: {
    userDataDir: string;
    connect: (endpoint: string) => Promise<unknown>;
  }) => {
    runtime.directory = options.userDataDir;
    return {
      ensure: async () => {
        await runtime.ensure();
        await options.connect('ws://synthetic');
      },
      stop: runtime.stop,
    };
  },
}));

import { previewGenuiDocument } from '../src/runtime/genui-preview.js';

beforeEach(() => {
  runtime.binary = '/synthetic/chrome';
  runtime.ensure.mockResolvedValue();
  runtime.stop.mockResolvedValue();
  runtime.send.mockImplementation(async (method: string) => {
    if (method === 'Target.createTarget') return { targetId: 'target' };
    if (method === 'Target.attachToTarget') return { sessionId: 'session' };
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame' } } };
    if (method === 'Runtime.evaluate')
      return { result: { value: { ready: true, measured: true, height: 48, diagnostics: [] } } };
    if (method === 'Page.captureScreenshot') return { data: 'c3ludGhldGlj' };
    return {};
  });
});

afterEach(() => vi.clearAllMocks());

describe('isolated GenUI preview lifecycle', () => {
  it('returns a tiny document preview and removes its disposable profile after stopping', async () => {
    runtime.stop.mockImplementationOnce(async () => {
      expect(existsSync(runtime.directory)).toBe(true);
      expect(runtime.send).toHaveBeenCalledWith('Browser.close');
    });
    const result = await previewGenuiDocument(syntheticGenuiDocument, { width: 390 });
    expect(result).toMatchObject({ width: 390, height: 48, screenshot: { mimeType: 'image/png' } });
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
      code: 'genui-preview-failed',
    });
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(existsSync(runtime.directory)).toBe(false);
    await expect(previewGenuiDocument(syntheticGenuiDocument)).resolves.toMatchObject({
      height: 48,
    });
  });

  it('refuses concurrent work, cancels an active preview, and releases the owner', async () => {
    const controller = new AbortController();
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    runtime.ensure.mockReturnValueOnce(pending);
    const first = previewGenuiDocument(syntheticGenuiDocument, { signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({ code: 'genui-preview-timeout' });
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
});
