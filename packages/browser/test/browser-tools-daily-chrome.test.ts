import { rmSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { execution, harness, screenshotDirs } from './support/browser-tools.js';

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('explicit daily Chrome control Provider', () => {
  const observe = async () => ({
    url: 'https://example.com/account',
    title: 'Account',
    text: 'Signed in',
    elements: [{ ref: 'document:1', role: 'button', name: 'Save' }],
  });
  it('exposes only three curated tools and applies Session approval and Audit', async () => {
    const act = vi.fn(async () => ({ url: 'https://example.com/account' }));
    const h = harness({ access: true, daily: () => ({ observe, act }) });
    h.created();
    expect(h.state.registered()).toEqual(['browser_click', 'browser_observe', 'browser_type']);
    const tool = h.state.definitions.get('browser_click')!;
    await expect(tool.execute({ ref: 'document:1' }, execution('browser_click'))).rejects.toThrow(
      'not authorized',
    );
    expect(act).not.toHaveBeenCalled();
    h.provider.markAuthorized('session-a');
    await tool.execute({ ref: 'document:1' }, execution('browser_click'));
    expect(act).toHaveBeenCalledWith(
      'bot-a',
      'click',
      { ref: 'document:1' },
      expect.any(AbortSignal),
    );
    expect(h.runtime.click).not.toHaveBeenCalled();
    expect(h.audits.map((item) => item.outcome)).toEqual(['error', 'ok']);
  });
  it('rejects a foreign Agent Session even when automatic Browser approval is enabled', async () => {
    const read = vi.fn(observe);
    const act = vi.fn(async () => ({ url: 'https://example.com/account' }));
    const h = harness({ access: true, auto: true, daily: () => ({ observe: read, act }) });
    h.created();
    const foreign = {
      ...execution('browser_observe'),
      agent: { id: 'foreign-session' } as unknown as Agent,
    };
    await expect(h.state.definitions.get('browser_observe')!.execute({}, foreign)).rejects.toThrow(
      'owning PersonaBot Session',
    );
    expect(read).not.toHaveBeenCalled();
    expect(act).not.toHaveBeenCalled();
    expect(h.runtime.ensure).not.toHaveBeenCalled();
  });
  it('refuses Pause and requires a fresh observation after Resume', async () => {
    const act = vi.fn(async () => ({ url: 'https://example.com/account' }));
    const h = harness({ access: true, auto: true, daily: () => ({ observe, act }) });
    h.created();
    h.provider.setTakeover('bot-a', true);
    await expect(
      h.state.definitions
        .get('browser_type')!
        .execute({ ref: 'document:1', text: 'private' }, execution('browser_type')),
    ).rejects.toThrow('Pause');
    h.provider.setTakeover('bot-a', false);
    await expect(
      h.state.definitions
        .get('browser_click')!
        .execute({ ref: 'document:1' }, execution('browser_click')),
    ).rejects.toThrow('fresh browser_observe');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'document:1' }, execution('browser_click'));
    expect(act).toHaveBeenCalledTimes(1);
  });
  it('revocation fences an in-flight result and clears Session approval', async () => {
    let finish: (() => void) | undefined;
    const h = harness({
      access: true,
      daily: () => ({
        observe,
        act: async () => {
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
          return { url: 'https://example.com/account' };
        },
      }),
    });
    h.created();
    h.provider.markAuthorized('session-a');
    const pending = h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'document:1' }, execution('browser_click'));
    await vi.waitFor(() => expect(finish).toBeDefined());
    h.provider.invalidateBot('bot-a');
    finish!();
    await expect(pending).rejects.toThrow('authority changed');
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    expect(h.audits.at(-1)?.outcome).toBe('error');
  });
});
