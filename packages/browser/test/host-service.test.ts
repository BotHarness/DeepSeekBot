import { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runtimes: vi.fn(),
  storedProfiles: vi.fn(async (): Promise<readonly string[]> => ['work']),
}));
vi.mock('../src/runtimes.js', () => ({
  createBotBrowserRuntimes: mocks.runtimes,
  listStoredProfileNames: mocks.storedProfiles,
}));

import { apply, DEFAULT_CONFIG, type BrowserConfig } from '../src/index.js';
import { BrowserProvisionError } from '../src/runtime/provision.js';

interface BrowserHostService {
  resetBot?(slug: string): void;
  executionSignal(sessionId: string): AbortSignal | undefined;
  needsAuthorization(sessionId: string): boolean;
  authorizationScope(sessionId?: string): string;
  markAuthorized(sessionId: string, scope?: string): boolean;
  reconcileBot(slug: string): Promise<void>;
}

interface Route {
  path: string;
  fetch(request: Request): Promise<Response>;
}

const contexts: Context[] = [];
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function setup(
  extraBot = false,
  autoAllowActions = true,
  target: BrowserConfig['target'] = 'local',
) {
  vi.stubEnv('DSH_HOME', '');
  const ctx = new Context();
  contexts.push(ctx);
  const profiles = new Map([
    ['bot-a', ''],
    ['bot-b', ''],
  ]);
  if (extraBot) profiles.set('bot-c', 'separate');
  const routes = new Map<string, Route>();
  const scopes = new Map<string, Map<string, ToolDefinition>>();
  let contribute:
    | ((scope: Context, agent: { id: string }, info: { botSlug: string; rootRole: string }) => void)
    | undefined;
  const opened: { slug: string; profile: string; reuse: string | undefined }[] = [];
  const captureScreenshot = vi.fn(async () => ({ mimeType: 'image/png', data: 'frame' }));
  const stopAll = vi.fn(async () => undefined);
  const stop = vi.fn(async (_slug: string) => undefined);
  const closeIdle = vi.fn(async () => undefined);
  const ensureFailure: { error?: unknown } = {};
  mocks.runtimes.mockReturnValue({
    for: (slug: string) => ({
      ensure: async () => {
        if ('error' in ensureFailure) throw ensureFailure.error;
      },
      open: async (url: string, reuse: string | undefined) => {
        const profile = profiles.get(slug) ?? '';
        opened.push({ slug, profile, reuse });
        return { tabId: `${slug}-${profile || 'default'}`, url, title: 'Work' };
      },
      click: async (tabId: string) => ({ tabId, url: 'https://example.com', title: 'Work' }),
      openWindow: async () => ({ tabId: `${slug}-default`, url: 'about:blank', title: 'Work' }),
      listTabs: async () =>
        [...profiles].map(([owner, profile]) => ({
          targetId: `${owner}-${profile || 'default'}`,
          url: 'https://example.com',
          title: 'Work',
        })),
      isRunning: () => true,
      captureScreenshot,
    }),
    profileOf: (slug: string) => profiles.get(slug) ?? '',
    installProgress: () => undefined,
    touch: () => undefined,
    stopAll,
    stop,
    closeIdle,
  });
  ctx.provide('connection', {
    fetch: {
      register: (route: Route) => {
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  } as never);
  ctx.provide('botharness', {
    registry: {
      get: (slug: string) => ({ browserAccess: true, browserProfile: profiles.get(slug) }),
      list: () => [...profiles.keys()].map((slug) => ({ slug, browserAccess: true })),
    },
    ownership: {
      resolve: (sessionId: string) => ({ botSlug: sessionId, rootRole: 'orchestrator' }),
    },
    contributeBotAgentSetup: (callback: typeof contribute) => {
      contribute = callback;
      return () => undefined;
    },
  } as never);
  apply(ctx, { ...DEFAULT_CONFIG, target, autoAllowActions });
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const slug of profiles.keys()) {
    const definitions = new Map<string, ToolDefinition>();
    const scope = {
      tools: {
        register: (definition: ToolDefinition) => {
          definitions.set(definition.name, definition);
          return () => definitions.delete(definition.name);
        },
      },
      systemPrompt: { section: () => () => undefined, getSectionOrder: () => 3000 },
    } as unknown as Context;
    scopes.set(slug, definitions);
    contribute?.(scope, { id: slug }, { botSlug: slug, rootRole: 'orchestrator' });
  }
  const service = ctx.get('botharnessBrowserTools') as unknown as BrowserHostService;
  async function open(slug: string) {
    await scopes
      .get(slug)!
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, {
        agent: { id: slug },
        signal: new AbortController().signal,
      } as ToolRunContext);
  }
  async function observation(
    slug: string,
  ): Promise<{ focused: string | null; takeover: boolean; profiles: readonly string[] }> {
    return (
      await routes
        .get('/api/browser/observation')!
        .fetch(new Request(`http://localhost/api/browser/observation?slug=${slug}`))
    ).json();
  }
  return {
    ctx,
    service,
    profiles,
    routes,
    opened,
    open,
    observation,
    scopes,
    stopAll,
    stop,
    closeIdle,
    captureScreenshot,
    ensureFailure,
  };
}

describe('published Browser Host service', () => {
  it('lists the Bot tools and runs one directly for the Owner through the Host route', async () => {
    const h = await setup();
    const listed = await h.routes
      .get('/api/browser/tools')!
      .fetch(new Request('http://localhost/api/browser/tools'));
    const catalog = (await listed.json()) as { tools: { name: string; inputSchema: unknown }[] };
    expect(catalog.tools.map((tool) => tool.name)).toContain('browser_open');
    const run = (body: unknown) =>
      h.routes.get('/api/browser/tool')!.fetch(
        new Request('http://localhost/api/browser/tool', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    const opened = await run({
      slug: 'bot-a',
      tool: 'browser_open',
      args: { url: 'https://example.com' },
    });
    expect(opened.status).toBe(200);
    expect(await opened.json()).toMatchObject({ ok: true, content: [{ type: 'text' }] });
    expect(h.opened).toHaveLength(1);
    expect((await run({ tool: 'browser_open', args: {} })).status).toBe(400);
    expect((await run({ slug: 'bot-a', tool: 'browser_open', args: [] })).status).toBe(400);
    const unknown = await run({ slug: 'bot-a', tool: 'browser_teleport', args: {} });
    expect(unknown.status).toBe(409);
    expect(await unknown.json()).toMatchObject({
      ok: false,
      error: 'Unknown browser tool browser_teleport',
    });
  });

  it('fences another profile preview while retrying a failed global cleanup', async () => {
    const h = await setup(true);
    await h.open('bot-c');
    let finish: ((value: { mimeType: string; data: string }) => void) | undefined;
    h.captureScreenshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const preview = h.routes
      .get('/api/browser/observation')!
      .fetch(new Request('http://localhost/api/browser/observation?slug=bot-c'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.stop.mockRejectedValueOnce(new Error('Docker unavailable'));
    const request = () =>
      new Request('http://localhost/api/browser/stop', {
        method: 'POST',
        body: JSON.stringify({ slug: 'bot-a' }),
      });
    expect((await h.routes.get('/api/browser/stop')!.fetch(request())).status).toBe(500);
    expect((await h.routes.get('/api/browser/stop')!.fetch(request())).status).toBe(200);
    finish!({ mimeType: 'image/png', data: 'old-frame' });
    expect((await preview).status).toBe(409);
  });

  it.each(['daily-control', 'profile-control', 'extension'] as const)(
    'retries failed owned cleanup before returning the %s target',
    async (target) => {
      const h = await setup(false, true, target);
      h.stopAll.mockRejectedValueOnce(new Error('Docker unavailable'));
      h.ctx.emit('loader/volatile-update', [['target']]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(await h.observation('bot-a')).toMatchObject({ cleanupRequired: true, target });
      const response = await h.routes.get('/api/browser/stop')!.fetch(
        new Request('http://localhost/api/browser/stop', {
          method: 'POST',
          body: JSON.stringify({ slug: 'bot-a' }),
        }),
      );
      expect(await response.json()).toEqual({ ok: true });
      expect(h.stopAll).toHaveBeenCalledTimes(2);
      expect(h.stop).not.toHaveBeenCalled();
      expect(await h.observation('bot-a')).not.toHaveProperty('cleanupRequired');
    },
  );

  it('keeps cleanup recovery visible and retries later idle ticks without admitting tools early', async () => {
    const timer = vi.spyOn(globalThis, 'setInterval');
    const h = await setup();
    const oldTool = h.scopes.get('bot-a')!.get('browser_open')!;
    const tick = timer.mock.calls.find((call) => call[1] === 30_000)?.[0];
    timer.mockRestore();
    if (typeof tick !== 'function') throw new Error('Missing Browser idle timer');
    h.closeIdle.mockRejectedValueOnce(new Error('Docker unavailable'));
    tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await h.observation('bot-a')).toMatchObject({ cleanupRequired: true, frame: null });
    await expect(h.open('bot-a')).rejects.toThrow('use Stop');
    expect(h.opened).toHaveLength(0);
    h.stopAll.mockRejectedValueOnce(new Error('Docker still unavailable'));
    tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.closeIdle).toHaveBeenCalledTimes(1);
    expect(await h.observation('bot-a')).toMatchObject({ cleanupRequired: true });
    await expect(
      oldTool.execute({ url: 'https://example.com' }, {
        agent: { id: 'bot-a' },
        signal: new AbortController().signal,
      } as ToolRunContext),
    ).rejects.toThrow();
    expect(h.opened).toHaveLength(0);
    tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.closeIdle).toHaveBeenCalledTimes(2);
    expect(h.stopAll).toHaveBeenCalledTimes(2);
    expect(await h.observation('bot-a')).not.toHaveProperty('cleanupRequired');
    await h.open('bot-a');
    expect(h.opened).toHaveLength(1);
  });

  it('fences old approvals and calls for all shared-profile Bots while preserving a separate profile', async () => {
    const h = await setup(true, false);
    const oldScope = h.service.authorizationScope('bot-a');
    const oldA = h.service.executionSignal('bot-a')!;
    const oldB = h.service.executionSignal('bot-b')!;
    const oldC = h.service.executionSignal('bot-c')!;
    const oldTool = h.scopes.get('bot-a')!.get('browser_open')!;
    h.service.markAuthorized('bot-a', oldScope);
    h.service.markAuthorized('bot-b', h.service.authorizationScope('bot-b'));
    h.service.markAuthorized('bot-c', h.service.authorizationScope('bot-c'));
    await h.open('bot-a');
    const response = await h.routes.get('/api/browser/stop')!.fetch(
      new Request('http://localhost/api/browser/stop', {
        method: 'POST',
        body: JSON.stringify({ slug: 'bot-a' }),
      }),
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(oldA.aborted).toBe(true);
    expect(oldB.aborted).toBe(true);
    expect(oldC.aborted).toBe(false);
    expect(h.service.markAuthorized('bot-a', oldScope)).toBe(false);
    expect(h.service.needsAuthorization('bot-a')).toBe(true);
    expect(h.service.needsAuthorization('bot-b')).toBe(true);
    expect(h.service.needsAuthorization('bot-c')).toBe(false);
    await expect(
      oldTool.execute({ url: 'https://example.com' }, {
        agent: { id: 'bot-a' },
        signal: new AbortController().signal,
      } as ToolRunContext),
    ).rejects.toThrow();
    await expect(h.open('bot-a')).rejects.toThrow(/approval|authorized/);
    expect(h.opened).toHaveLength(1);
    expect(h.service.markAuthorized('bot-a', h.service.authorizationScope('bot-a'))).toBe(true);
    await h.open('bot-a');
    expect(h.opened).toHaveLength(2);
  });
  it('rejects a Human preview frame completed after Stop rather than resurfacing the old browser', async () => {
    const h = await setup();
    await h.open('bot-a');
    let finish: ((value: { mimeType: string; data: string }) => void) | undefined;
    h.captureScreenshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const preview = h.routes
      .get('/api/browser/observation')!
      .fetch(new Request('http://localhost/api/browser/observation?slug=bot-a'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finish).toBeDefined();
    await h.routes.get('/api/browser/stop')!.fetch(
      new Request('http://localhost/api/browser/stop', {
        method: 'POST',
        body: JSON.stringify({ slug: 'bot-a' }),
      }),
    );
    finish!({ mimeType: 'image/png', data: 'old-frame' });
    const result = await preview;
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({
      ok: false,
      error: 'Browser authority changed during observation',
    });
  });
  it.each(['target', 'localDriver', 'containerDriver'])(
    'lets Human Stop retry retained %s disposal before replacement execution',
    async (field) => {
      const h = await setup();
      h.stopAll.mockRejectedValueOnce(new Error('Docker unavailable'));
      h.ctx.emit('loader/volatile-update', [[field]]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const openRoute = h.routes.get('/api/browser/open')!;
      const openRequest = () =>
        new Request('http://localhost/api/browser/open', {
          method: 'POST',
          body: JSON.stringify({ slug: 'bot-a' }),
        });
      expect((await openRoute.fetch(openRequest())).status).toBe(500);
      expect(h.opened).toHaveLength(0);
      expect(await h.observation('bot-a')).toMatchObject({ cleanupRequired: true, frame: null });
      const response = await h.routes.get('/api/browser/stop')!.fetch(
        new Request('http://localhost/api/browser/stop', {
          method: 'POST',
          body: JSON.stringify({ slug: 'bot-a' }),
        }),
      );
      expect(await response.json()).toEqual({ ok: true });
      expect(h.stopAll).toHaveBeenCalledTimes(2);
      expect(h.stop).toHaveBeenCalledWith('bot-a');
      expect(await (await openRoute.fetch(openRequest())).json()).toMatchObject({ ok: true });
    },
  );
  it('resets the switching Bot through the service used by core without resetting another Bot', async () => {
    const h = await setup();
    expect((await h.observation('bot-a')).profiles).toEqual(['work']);
    await h.open('bot-a');
    await h.open('bot-b');
    await h.routes.get('/api/browser/takeover')!.fetch(
      new Request('http://localhost/api/browser/takeover', {
        method: 'POST',
        body: JSON.stringify({ slug: 'bot-a', active: true }),
      }),
    );
    h.profiles.set('bot-a', 'work');
    h.service.resetBot?.('bot-a');
    expect(await h.observation('bot-a')).toMatchObject({ focused: null, takeover: false });
    expect(await h.observation('bot-b')).toMatchObject({ focused: 'bot-b-default' });
    await h.open('bot-a');
    expect(h.opened.at(-1)).toEqual({ slug: 'bot-a', profile: 'work', reuse: undefined });
    expect(await h.observation('bot-a')).toMatchObject({ focused: 'bot-a-work' });
  });
  it('preserves the live observation when auxiliary profile discovery fails', async () => {
    const h = await setup();
    await h.open('bot-a');
    await h.routes.get('/api/browser/takeover')!.fetch(
      new Request('http://localhost/api/browser/takeover', {
        method: 'POST',
        body: JSON.stringify({ slug: 'bot-a', active: true }),
      }),
    );
    const before = await h.observation('bot-a');
    expect(before).toMatchObject({
      focused: 'bot-a-default',
      takeover: true,
      frame: 'data:image/png;base64,frame',
      running: true,
    });
    for (const code of ['EACCES', 'ENOTDIR']) {
      mocks.storedProfiles.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code }));
      expect(await h.observation('bot-a')).toEqual({ ...before, profiles: [] });
    }
    expect(await h.observation('bot-a')).toEqual(before);
  });
  it('keeps another Bot usable while the resumed Bot needs a fresh observation', async () => {
    const h = await setup();
    await h.open('bot-a');
    await h.open('bot-b');
    for (const active of [true, false]) {
      await h.routes.get('/api/browser/takeover')!.fetch(
        new Request('http://localhost/api/browser/takeover', {
          method: 'POST',
          body: JSON.stringify({ slug: 'bot-a', active }),
        }),
      );
    }
    const click = (slug: string) =>
      h.scopes
        .get(slug)!
        .get('browser_click')!
        .execute({ ref: 'e1' }, {
          agent: { id: slug },
          signal: new AbortController().signal,
        } as ToolRunContext);
    await expect(click('bot-a')).rejects.toThrow(/Resume.*browser_observe/);
    await expect(click('bot-b')).resolves.toBeDefined();
    expect(await h.observation('bot-b')).toMatchObject({
      focused: 'bot-b-default',
      takeover: false,
    });
  });
  it('serializes provisioning failures with code and detail on the open route', async () => {
    const h = await setup();
    h.ensureFailure.error = new BrowserProvisionError(
      'provision-no-network',
      'The Bot Browser download failed because this machine looks offline.',
      'getaddrinfo EAI_AGAIN',
    );
    const response = await h.routes.get('/api/browser/open')!.fetch(
      new Request('http://localhost/api/browser/open', {
        method: 'POST',
        body: JSON.stringify({ slug: 'bot-a' }),
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'The Bot Browser download failed because this machine looks offline.',
      code: 'provision-no-network',
      detail: 'getaddrinfo EAI_AGAIN',
    });
  });
  it('reports no in-flight provisioning on observation by default', async () => {
    const h = await setup();
    expect(await h.observation('bot-a')).toMatchObject({ provisioning: null });
  });
});
