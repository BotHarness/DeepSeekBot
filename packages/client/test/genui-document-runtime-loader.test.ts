import { describe, expect, it, vi } from 'vitest';
import type { GenuiDocumentRuntime } from '../../core/src/channels/genui-document-runtime.js';
import { createGenuiRuntimeLoader } from '../src/client/genui-document-runtime.js';

async function loader(load: () => Promise<GenuiDocumentRuntime>) {
  const async = vi.fn(load);
  return { async, load: createGenuiRuntimeLoader(async) };
}

describe('GenUI document runtime loader', () => {
  it('requests the packaged runtime synchronously on the first call and reuses it', async () => {
    const runtime: GenuiDocumentRuntime = { mountGenuiDocument: vi.fn() };
    const { async, load } = await loader(() => Promise.resolve(runtime));
    const first = load();
    expect(async).toHaveBeenCalledOnce();
    expect(load()).toBe(first);
    await expect(first).resolves.toBe(runtime);
    expect(async).toHaveBeenCalledTimes(1);
  });

  it('turns a synchronous loader failure into a rejection and retries on the next call', async () => {
    let fail = true;
    const runtime: GenuiDocumentRuntime = { mountGenuiDocument: vi.fn() };
    const { async, load } = await loader(() => {
      if (fail) throw new Error('loader unavailable');
      return Promise.resolve(runtime);
    });
    await expect(load()).rejects.toThrow('loader unavailable');
    fail = false;
    await expect(load()).resolves.toBe(runtime);
    expect(async).toHaveBeenCalledTimes(2);
  });

  it('forgets a rejected download so a later call fetches again', async () => {
    const runtime: GenuiDocumentRuntime = { mountGenuiDocument: vi.fn() };
    const results = [Promise.reject(new Error('network')), Promise.resolve(runtime)];
    const { async, load } = await loader(
      () => results.shift() ?? Promise.reject(new Error('unexpected')),
    );
    await expect(load()).rejects.toThrow('network');
    await expect(load()).resolves.toBe(runtime);
    expect(async).toHaveBeenCalledTimes(2);
  });

  it('keeps an unobserved failed request from becoming an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { load } = await loader(() => Promise.reject(new Error('discarded')));
      load();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
