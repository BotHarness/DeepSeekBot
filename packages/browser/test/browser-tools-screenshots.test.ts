import { readdirSync, rmSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToolRunContext, ToolExecutionSuccess } from '@deepseek-ai/dsh-tools';

import { execution, harness, screenshotDirs } from './support/browser-tools.js';

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('per-PersonaBot registration, authorization, and tabs', () => {
  it('captures a screenshot as an image result and audits it redacted', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const shot = await h.state.definitions
      .get('browser_screenshot')!
      .execute({}, execution('browser_screenshot'));
    expect(h.runtime.captureScreenshot).toHaveBeenCalledWith('tab-1');
    expect(JSON.stringify(shot)).toContain('Zm9v');
    expect(JSON.stringify(shot)).toContain('Screenshot saved to');
    expect(readdirSync(h.screenshotDir)).toHaveLength(1);
    expect(h.audits.at(-1)?.summary).toBe('screenshot');
  });

  it.each(['paused', 'resumed'] as const)(
    'discards a pending screenshot after Human control changes while %s',
    async (phase) => {
      const h = harness({ access: true, auto: true });
      h.created();
      const call = (name: string, args = {}) =>
        h.state.definitions.get(name)!.execute(args, execution(name));
      await call('browser_open', { url: 'https://example.com' });
      let started!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.runtime.captureScreenshot = vi.fn(async () => {
        started();
        await pending;
        return { data: 'Zm9v', mimeType: 'image/jpeg' };
      });
      const screenshot = call('browser_screenshot');
      const refused = expect(screenshot).rejects.toThrow(/Browser Pause|Browser control changed/);
      await entered;
      h.provider.setTakeover('bot-a', true);
      if (phase === 'resumed') h.provider.setTakeover('bot-a', false);
      release();
      await refused;
      expect(readdirSync(h.screenshotDir)).toHaveLength(0);
      expect(h.audits.at(-1)).toMatchObject({
        tool: 'browser_screenshot',
        outcome: 'error',
        summary: 'screenshot',
      });
      expect(h.provider.currentTab('bot-a')).toBe('tab-1');
      if (phase === 'paused') h.provider.setTakeover('bot-a', false);
      const fresh = await call('browser_screenshot');
      expect(JSON.stringify(fresh)).toContain('Screenshot saved to');
    },
  );

  it('refuses a screenshot queued before a Pause cycle without starting capture', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const call = (name: string, args = {}) =>
      h.state.definitions.get(name)!.execute(args, execution(name));
    await call('browser_open', { url: 'https://example.com' });
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observe = h.runtime.observe;
    h.runtime.observe = vi.fn(async (tabId: string) => {
      started();
      await pending;
      return observe(tabId);
    });
    const read = call('browser_observe');
    await entered;
    const shot = call('browser_screenshot');
    const refused = expect(shot).rejects.toThrow(/Browser control changed/);
    h.provider.setTakeover('bot-a', true);
    h.provider.setTakeover('bot-a', false);
    release();
    await read;
    await refused;
    expect(h.runtime.captureScreenshot).not.toHaveBeenCalled();
    expect(readdirSync(h.screenshotDir)).toHaveLength(0);
    await call('browser_screenshot');
    expect(h.runtime.captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it.each(['paused', 'resumed'] as const)(
    'refuses the image after native attachment admission overlaps Human control while %s',
    async (phase) => {
      const h = harness({ access: true, auto: true });
      h.created();
      await h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open'));
      let started!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const saveImages = vi.fn(async () => {
        started();
        await pending;
        return [
          {
            attachmentId: `sha256:${'a'.repeat(64)}`,
            mediaType: 'image/jpeg',
            bytes: 3,
            width: 1,
            height: 1,
          },
        ];
      });
      h.state.services.set('attachments', { saveImages });
      h.state.services.set('llm', {
        resolveModelInfo: async () => ({ inputModalities: ['image'] }),
      });
      const exec = {
        ...execution('browser_screenshot'),
        agent: {
          id: 'session-a',
          options: {},
          session: { requestHeader: () => ({ config: { provider: 'qa', model: 'vision' } }) },
        },
      } as unknown as ToolRunContext;
      const shot = h.state.definitions.get('browser_screenshot')!.execute({}, exec);
      const refused = expect(shot).rejects.toThrow(/Browser Pause|Browser control changed/);
      await entered;
      h.provider.setTakeover('bot-a', true);
      if (phase === 'resumed') h.provider.setTakeover('bot-a', false);
      release();
      await refused;
      expect(saveImages).toHaveBeenCalledTimes(1);
      expect(h.audits.filter((event) => event.tool === 'browser_screenshot')).toEqual([
        expect.objectContaining({ outcome: 'error', summary: 'screenshot' }),
      ]);
    },
  );

  it('uses the pinned native MCP text fallback when a model route rejects image input', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const saveImages = vi.fn(async () => []);
    h.state.services.set('attachments', { saveImages });
    h.state.services.set('llm', { resolveModelInfo: async () => ({ inputModalities: ['text'] }) });
    const exec = {
      ...execution('browser_screenshot'),
      agent: {
        id: 'session-a',
        options: {},
        session: { requestHeader: () => ({ config: { provider: 'qa', model: 'text-only' } }) },
      },
    } as unknown as ToolRunContext;
    const definition = h.state.definitions.get('browser_screenshot')!;
    const value = (await definition.execute({}, exec)) as ToolExecutionSuccess['value'];
    const content = definition.projectContent!(exec, {
      isError: false,
      value,
      content: definition.output.render({}, value),
    });
    expect(JSON.stringify(content)).toContain('image unavailable');
    expect(JSON.stringify(content)).toContain('does not declare image input');
    expect(JSON.stringify(content)).not.toContain('Zm9v');
    expect(content?.some((block) => block.type === 'image')).toBe(false);
    expect(saveImages).not.toHaveBeenCalled();
  });

  it('reports an unavailable native frame without creating a model image or saved file', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.captureScreenshot = vi.fn(async () => undefined);
    const result = await h.state.definitions
      .get('browser_screenshot')!
      .execute({}, execution('browser_screenshot'));
    expect(JSON.stringify(result)).toContain('image unavailable');
    expect(readdirSync(h.screenshotDir)).toHaveLength(0);
    expect(h.audits.at(-1)).toMatchObject({ summary: 'screenshot', outcome: 'ok' });
  });

  it('keeps only the newest screenshots on disk', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const screenshot = h.state.definitions.get('browser_screenshot')!;
    await screenshot.execute({}, execution('browser_screenshot'));
    await screenshot.execute({}, execution('browser_screenshot'));
    await screenshot.execute({}, execution('browser_screenshot'));
    expect(readdirSync(h.screenshotDir)).toHaveLength(2);
  });

  it('reports the coordinate conversion when the image is not 1:1', async () => {
    const h = harness({ access: true, auto: true });
    h.runtime.captureScreenshot = vi.fn(async () => ({
      data: 'Zm9v',
      mimeType: 'image/jpeg',
      viewport: { width: 1200, height: 736 },
      image: { width: 2400, height: 1472 },
    }));
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const shot = await h.state.definitions
      .get('browser_screenshot')!
      .execute({}, execution('browser_screenshot'));
    expect(JSON.stringify(shot)).toContain('divide image coordinates by 2.00');
  });

  it('reports a tab-less screenshot readably', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await expect(
      h.state.definitions.get('browser_screenshot')!.execute({}, execution('browser_screenshot')),
    ).rejects.toThrow(/call browser_open/);
  });
});
