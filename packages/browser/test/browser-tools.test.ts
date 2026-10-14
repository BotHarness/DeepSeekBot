import { readPublicToolDetail } from '../../core/src/state/tool-activity.js';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolDefinition, ToolRunContext, ToolExecutionSuccess } from '@deepseek-ai/dsh-tools';

import type { BotBrowserRuntime } from '../src/runtime/browser.js';
import { createTakeoverService } from '../src/takeover.js';
import {
  auditSummary,
  createBrowserToolProvider,
  formatAudit,
  ownsBrowserTool,
  type BrowserAuditEvent,
} from '../src/tool/provider.js';

interface FakeScope {
  readonly definitions: Map<string, ToolDefinition>;
  readonly services: Map<string, unknown>;
  readonly sections: string[];
  registered(): readonly string[];
}

function fakeScope(): { scope: Context; state: FakeScope } {
  const definitions = new Map<string, ToolDefinition>();
  const services = new Map<string, unknown>();
  const sections: string[] = [];
  const scope = {
    get: (name: string) => services.get(name),
    tools: {
      register(definition: ToolDefinition) {
        definitions.set(definition.name, definition);
        return () => definitions.delete(definition.name);
      },
    },
    systemPrompt: {
      section(options: { name: string }) {
        sections.push(options.name);
        return () => undefined;
      },
      getSectionOrder: () => 3000,
    },
  } as unknown as Context;
  return {
    scope,
    state: {
      definitions,
      services,
      sections,
      registered: () => [...definitions.keys()].sort(),
    },
  };
}

function fakeRuntime(overrides: Partial<BotBrowserRuntime> = {}): BotBrowserRuntime {
  return {
    ensure: vi.fn(async () => undefined),
    isRunning: () => true,
    open: vi.fn(async (url: string) => ({ tabId: 'tab-1', url, title: 'Example Domain' })),
    observe: vi.fn(async () => ({
      url: 'https://example.com/',
      title: 'Example Domain',
      elements: [{ ref: 'e1', role: 'a', name: 'More information' }],
      text: 'Hello world',
    })),
    click: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    clickAt: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    type: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    pressKey: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    insertText: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    scroll: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    uploadFile: vi.fn(async () => undefined),
    createTab: vi.fn(async (url: string) => ({
      tabId: 'tab-2',
      url,
      title: 'Example Domain',
    })),
    listTabs: vi.fn(async () => [
      { targetId: 'tab-1', url: 'https://example.com/', title: 'Example Domain' },
      { targetId: 'tab-2', url: 'https://example.org/', title: 'Other' },
    ]),
    tabInfo: vi.fn(async () => ({ url: 'https://example.com/', title: 'Example Domain' })),
    closeTab: vi.fn(async () => undefined),
    captureScreenshot: vi.fn(async () => ({ data: 'Zm9v', mimeType: 'image/jpeg' })),
    openWindow: vi.fn(async () => ({ tabId: 'tab-9', url: 'about:blank', title: '' })),
    currentUrl: () => undefined,
    binaryPath: () => undefined,
    stop: vi.fn(async () => undefined),
    ...overrides,
  };
}

interface Harness {
  readonly provider: ReturnType<typeof createBrowserToolProvider>;
  readonly scope: Context;
  readonly state: FakeScope;
  readonly runtime: BotBrowserRuntime;
  readonly runtimes: {
    readonly stopAll: ReturnType<typeof vi.fn>;
  };
  readonly audits: BrowserAuditEvent[];
  readonly takeovers: ReturnType<typeof createTakeoverService>;
  readonly screenshotDir: string;
  created(): void;
  setAccess(enabled: boolean): void;
  setAuto(allow: boolean): void;
}

const screenshotDirs: string[] = [];

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness(options: {
  access: boolean;
  auto?: boolean;
  daily?: Parameters<typeof createBrowserToolProvider>[0]['daily'];
  profile?: Parameters<typeof createBrowserToolProvider>[0]['profile'];
  borrowed?: Parameters<typeof createBrowserToolProvider>[0]['borrowed'];
  takeover?: Parameters<typeof createBrowserToolProvider>[0]['takeover'];
}): Harness {
  const { scope, state } = fakeScope();
  const runtime = fakeRuntime();
  const audits: BrowserAuditEvent[] = [];
  const takeovers = createTakeoverService();
  const screenshotDir = mkdtempSync(join(tmpdir(), 'browser-tools-'));
  screenshotDirs.push(screenshotDir);
  let access = options.access;
  let auto = options.auto ?? false;
  const ctx = {
    on() {},
    inject() {},
    provide() {},
    logger: { info: () => undefined, warn: () => undefined },
    get: () => undefined,
  } as unknown as Context;
  const runtimes = {
    for: () => runtime,
    touch: vi.fn(),
    installProgress: () => undefined,
    closeIdle: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    stopAll: vi.fn(async () => undefined),
    profileOf: () => '',
  };
  const provider = createBrowserToolProvider({
    ctx,
    runtimes,
    screenshotDir,
    screenshotLimit: 2,
    isAutoAllowed: () => auto,
    ...(options.daily === undefined ? {} : { daily: options.daily }),
    ...(options.profile === undefined ? {} : { profile: options.profile }),
    ...(options.borrowed === undefined ? {} : { borrowed: options.borrowed }),
    takeover: options.takeover ?? (() => takeovers),
    takeoverUrlFor: () => '/botharness-browser/viewer/local/?slug=bot-a',
    audit: (event) => audits.push(event),
    core: () => ({
      registry: {
        get: (slug: string) => (slug === 'bot-a' ? { browserAccess: access } : undefined),
        list: () => [{ slug: 'bot-a', browserAccess: access }],
      },
      ownership: {
        resolve: (sessionId: string) =>
          sessionId === 'session-a' ? { botSlug: 'bot-a', rootRole: 'orchestrator' } : undefined,
      },
    }),
  });
  return {
    provider,
    scope,
    state,
    runtime,
    runtimes,
    audits,
    takeovers,
    screenshotDir,
    created: () =>
      provider.attachAgent(scope, 'session-a', { botSlug: 'bot-a', rootRole: 'orchestrator' }),
    setAccess: (next) => {
      access = next;
    },
    setAuto: (next) => {
      auto = next;
    },
  };
}

const agent: Agent = { id: 'session-a' } as unknown as Agent;

function execution(name: string): ToolRunContext {
  return {
    callId: 'call-1',
    name,
    arguments: {},
    agent,
    signal: new AbortController().signal,
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  } as unknown as ToolRunContext;
}

describe('curated catalog and audit redaction', () => {
  it('candidate observation cannot survive Pause and Resume in flight', async () => {
    const h = harness({ access: true, auto: true });
    h.runtime.runWithSignal = async (_signal, action, guard) => {
      guard?.();
      return action();
    };
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const observe = h.runtime.observe;
    h.runtime.observe = vi.fn(async (tab) => {
      h.provider.setTakeover('bot-a', true);
      h.provider.setTakeover('bot-a', false);
      return observe(tab);
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow('Browser control changed during the call');
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e1' }, execution('browser_click')),
    ).rejects.toThrow(/Resume.*browser_observe/);
    expect(h.runtime.click).not.toHaveBeenCalled();
  });
  it('rejects reuse of managed tools by a foreign Session before runtime or approval', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const foreign = {
      ...execution('browser_open'),
      agent: { id: 'foreign-session' } as unknown as Agent,
    };
    await expect(
      h.state.definitions.get('browser_open')!.execute({ url: 'https://example.com' }, foreign),
    ).rejects.toThrow('owning PersonaBot Session');
    expect(h.runtime.ensure).not.toHaveBeenCalled();
    expect(h.runtime.open).not.toHaveBeenCalled();
  });
  it('owns exactly the curated model-facing names', () => {
    expect(ownsBrowserTool('browser_open')).toBe(true);
    expect(ownsBrowserTool('browser_observe')).toBe(true);
    expect(ownsBrowserTool('browser_click')).toBe(true);
    expect(ownsBrowserTool('browser_hover')).toBe(false);
    expect(ownsBrowserTool('computer_click')).toBe(false);
  });

  it('audits the URL but never page contents or typed text', () => {
    const summary = auditSummary('open', { url: 'https://example.com/account?secret=1' });
    expect(summary).toContain('https://example.com/account');
    expect(auditSummary('observe', {})).toBe('observe');
    expect(auditSummary('nope', {})).toBe('tool');
  });

  it('formats a stable audit line', () => {
    const line = formatAudit({
      at: new Date().toISOString(),
      botSlug: 'bot-a',
      sessionId: 'session-a',
      rootRole: 'orchestrator',
      tool: 'browser_open',
      summary: 'url=https://example.com',
      outcome: 'ok',
      durationMs: 42,
    });
    expect(line).toBe(
      'bot=bot-a session=session-a role=orchestrator browser_open url=https://example.com -> ok (42ms)',
    );
  });
});

describe('per-PersonaBot registration, authorization, and tabs', () => {
  it('Daily Browser exposes only observation and retains Session authorization and audit', async () => {
    const observe = vi.fn(async () => ({
      url: 'https://example.com/page',
      title: 'Signed in',
      text: 'PRIVATE-PAGE-QA',
      elements: [],
    }));
    const h = harness({ access: true, borrowed: () => ({ observe }) });
    h.created();
    expect(h.state.registered()).toEqual(['browser_observe']);
    const tool = h.state.definitions.get('browser_observe')!;
    await expect(tool.execute({}, execution('browser_observe'))).rejects.toThrow('not authorized');
    expect(observe).not.toHaveBeenCalled();
    h.provider.markAuthorized('session-a');
    const result = await tool.execute({}, execution('browser_observe'));
    expect(JSON.stringify(result)).toContain('PRIVATE-PAGE-QA');
    expect(h.runtime.ensure).not.toHaveBeenCalled();
    expect(h.runtime.open).not.toHaveBeenCalled();
    expect(h.audits.at(-1)).toMatchObject({
      tool: 'browser_observe',
      botSlug: 'bot-a',
      sessionId: 'session-a',
      outcome: 'ok',
    });
    expect(JSON.stringify(h.audits)).not.toContain('PRIVATE-PAGE-QA');
    h.provider.invalidateBot('bot-a');
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
  });
  it('registers nothing while Browser Access is off', () => {
    const h = harness({ access: false });
    h.created();
    expect(h.state.registered()).toEqual([]);
  });

  it('registers the read-only tools plus guidance when access is on', () => {
    const h = harness({ access: true });
    h.created();
    expect(h.state.registered()).toEqual([
      'browser_click',
      'browser_observe',
      'browser_open',
      'browser_press_key',
      'browser_screenshot',
      'browser_scroll',
      'browser_tabs',
      'browser_takeover',
      'browser_type',
      'browser_upload',
      'browser_wait',
    ]);
    expect(h.state.sections).toContain('botharness:browser');
  });

  it('fails closed until core records the Browser Authorization grant', async () => {
    const h = harness({ access: true });
    h.created();
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/not authorized/);
    expect(h.runtime.open).not.toHaveBeenCalled();
    h.provider.markAuthorized('session-a');
    expect(h.provider.needsAuthorization('session-a')).toBe(false);
  });

  it('runs the same tools directly for the Owner without a Session, model or approval card', async () => {
    const h = harness({ access: true, auto: false });
    const opened = await h.provider.runDirect('bot-a', 'browser_open', {
      url: 'https://example.com',
    });
    expect(h.runtime.open).toHaveBeenCalledWith('https://example.com', undefined);
    expect(JSON.stringify(opened)).toContain('Opened https://example.com');
    const observed = await h.provider.runDirect('bot-a', 'observe', {});
    expect(h.runtime.observe).toHaveBeenCalledWith('tab-1');
    expect(JSON.stringify(observed)).toContain('Hello world');
    expect(h.audits.map((event) => [event.tool, event.sessionId, event.outcome])).toEqual([
      ['browser_open', 'direct', 'ok'],
      ['browser_observe', 'direct', 'ok'],
    ]);
    await expect(h.provider.runDirect('bot-a', 'browser_teleport', {})).rejects.toThrow(
      'Unknown browser tool',
    );
    h.setAccess(false);
    await expect(h.provider.runDirect('bot-a', 'observe', {})).rejects.toThrow(
      'Browser Access is off',
    );
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_observe', outcome: 'error' });
  });

  it('opens a URL, reuses the Bot tab, and observes it with refs', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const opened = await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    expect(h.runtime.open).toHaveBeenCalledWith('https://example.com', undefined);
    expect(JSON.stringify(opened)).toContain('Opened https://example.com');
    const observed = await h.state.definitions
      .get('browser_observe')!
      .execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenCalledWith('tab-1');
    const text = JSON.stringify(observed);
    expect(text).toContain('e1');
    expect(text).toContain('Hello world');
    expect(h.audits.map((event) => event.outcome)).toEqual(['ok', 'ok']);
    expect(h.audits[0]?.summary).toContain('example.com');
  });

  it('rejects a non-http URL and a missing tab readably', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'file:///etc/passwd' }, execution('browser_open')),
    ).rejects.toThrow(/absolute http\(s\) URL/);
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/call browser_open/);
  });

  it('audits upload size and redacts Host paths on failures without changing the tool error', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const path = join(h.screenshotDir, 'upload.txt');
    writeFileSync(path, 'private contents');
    const call = (name: string, args = {}) =>
      h.state.definitions.get(name)!.execute(args, execution(name));
    await call('browser_open', { url: 'https://example.com' });
    await call('browser_observe');
    await call('browser_upload', { path, ref: 'e1' });
    expect(h.audits.at(-1)?.summary).toBe('file=upload.txt bytes=16 ref=e1');
    h.runtime.uploadFile = vi.fn(async () => {
      throw Error(`The file does not exist on the Host: ${path}`);
    });
    await expect(call('browser_upload', { path })).rejects.toThrow(path);
    expect(JSON.stringify(h.audits)).not.toContain(path);
    expect(JSON.stringify(h.audits)).not.toContain('private contents');
    expect(h.audits.at(-1)?.error).toBe('The file does not exist on the Host: upload.txt');
  });

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

  it('pauses actions and screenshots under Browser Pause while observe stays read-only', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.provider.setTakeover('bot-a', true);
    expect(h.provider.isTakeover('bot-a')).toBe(true);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.org' }, execution('browser_open')),
    ).rejects.toThrow(/Browser Pause is active.*Resume.*browser_observe/);
    await expect(
      h.state.definitions.get('browser_screenshot')!.execute({}, execution('browser_screenshot')),
    ).rejects.toThrow(/Browser Pause is active.*Resume.*browser_observe/);
    const observed = await h.state.definitions
      .get('browser_observe')!
      .execute({}, execution('browser_observe'));
    expect(JSON.stringify(observed)).toContain('Hello world');
    h.provider.setTakeover('bot-a', false);
    await h.state.definitions
      .get('browser_screenshot')!
      .execute({}, execution('browser_screenshot'));
    expect(h.runtime.captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['browser_click', { ref: 'e1' }],
    ['browser_click', { x: 10, y: 10 }],
    ['browser_type', { ref: 'e1', text: 'changed' }],
    ['browser_press_key', { key: 'Enter' }],
    ['browser_scroll', { direction: 'down' }],
    ['browser_upload', { path: '/tmp/qa.txt' }],
  ])('requires a new observation after Resume before %s', async (name, args) => {
    const h = harness({ access: true, auto: true });
    h.created();
    const call = (tool: string, input = {}) =>
      h.state.definitions.get(tool)!.execute(input, execution(tool));
    await call('browser_open', { url: 'https://example.com' });
    await call('browser_observe');
    h.provider.setTakeover('bot-a', true);
    await call('browser_observe');
    h.provider.setTakeover('bot-a', false);
    await call('browser_screenshot');
    await expect(call(name, args)).rejects.toThrow(/Resume.*browser_observe/);
    await call('browser_observe');
    await expect(call(name, args)).resolves.toBeDefined();
  });

  it.each(['before Pause', 'during Pause', 'during Access cycling'])(
    'does not let a read %s or a failed read satisfy the fresh-read requirement',
    async (phase) => {
      const h = harness({ access: true, auto: true });
      h.created();
      const call = (name: string, args = {}) =>
        h.state.definitions.get(name)!.execute(args, execution(name));
      await call('browser_open', { url: 'https://example.com' });
      const observe = h.runtime.observe;
      let release!: () => void;
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.runtime.observe = vi.fn(async (tabId: string) => {
        started();
        await pending;
        return observe(tabId);
      });
      if (phase !== 'before Pause') h.provider.setTakeover('bot-a', true);
      const oldRead = call('browser_observe');
      const oldReadResult =
        phase === 'during Access cycling'
          ? expect(oldRead).rejects.toThrow(/Browser Access is off/)
          : oldRead;
      await entered;
      if (phase === 'during Access cycling') {
        h.setAccess(false);
        await h.provider.reconcileBot('bot-a');
        h.setAccess(true);
        await h.provider.reconcileBot('bot-a');
      } else {
        h.provider.setTakeover('bot-a', true);
        h.provider.setTakeover('bot-a', false);
      }
      release();
      await oldReadResult;
      await expect(call('browser_click', { ref: 'e1' })).rejects.toThrow(/Resume.*browser_observe/);
      h.runtime.observe = vi.fn(async () => {
        throw new Error('temporary read failure');
      });
      await expect(call('browser_observe')).rejects.toThrow('temporary read failure');
      await expect(call('browser_click', { ref: 'e1' })).rejects.toThrow(/Resume.*browser_observe/);
      h.runtime.observe = observe;
      await call('browser_observe');
      await call('browser_click', { ref: 'e1' });
    },
  );

  it('retains the Resume requirement across Access cycling but allows navigation to recover a page', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const call = (name: string, args = {}) =>
      h.state.definitions.get(name)!.execute(args, execution(name));
    await call('browser_open', { url: 'https://example.com' });
    h.provider.setTakeover('bot-a', true);
    h.provider.setTakeover('bot-a', false);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    await call('browser_open', { url: 'https://example.org' });
    await call('browser_tabs', { action: 'list' });
    await expect(call('browser_click', { ref: 'e1' })).rejects.toThrow(/Resume.*browser_observe/);
    await call('browser_observe');
    await call('browser_click', { ref: 'e1' });
  });

  it.each(['authorization', 'access', 'pause', 'resume'] as const)(
    'audits an immediate %s refusal exactly once without dispatching the action',
    async (guard) => {
      const h = harness({ access: true, auto: guard !== 'authorization' });
      h.created();
      const name = guard === 'authorization' ? 'browser_open' : 'browser_click';
      const definition = h.state.definitions.get(name)!;
      if (guard !== 'authorization') {
        await h.state.definitions
          .get('browser_open')!
          .execute({ url: 'https://example.com' }, execution('browser_open'));
      }
      h.audits.length = 0;
      if (guard === 'access') {
        h.setAccess(false);
        await h.provider.reconcileBot('bot-a');
      } else if (guard === 'pause' || guard === 'resume') {
        h.provider.setTakeover('bot-a', true);
        if (guard === 'resume') h.provider.setTakeover('bot-a', false);
      }
      await expect(
        definition.execute(
          guard === 'authorization' ? { url: 'https://example.com' } : { ref: 'e1' },
          execution(name),
        ),
      ).rejects.toThrow();
      expect(h.audits).toHaveLength(1);
      expect(h.audits[0]).toMatchObject({
        botSlug: 'bot-a',
        sessionId: 'session-a',
        rootRole: 'orchestrator',
        tool: name,
        outcome: 'error',
      });
      expect(h.audits[0]?.error).toMatch(
        /not authorized|Access is off|Pause is active|Resume requires/,
      );
      expect(h.audits[0]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(h.runtime.click).not.toHaveBeenCalled();
      if (guard === 'authorization') expect(h.runtime.open).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'browser_type',
      { ref: 'e1', text: 'QA_PRIVATE_TYPED_MARKER' },
      'chars=23',
      'QA_PRIVATE_TYPED_MARKER',
    ],
    [
      'browser_upload',
      { path: '/tmp/private-qa-path/upload.txt' },
      'file=upload.txt',
      '/tmp/private-qa-path',
    ],
  ])('redacts an immediately refused %s attempt', async (name, args, summary, privateValue) => {
    const h = harness({ access: true, auto: true });
    h.created();
    h.provider.setTakeover('bot-a', true);
    await expect(h.state.definitions.get(name)!.execute(args, execution(name))).rejects.toThrow(
      /Pause is active/,
    );
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.summary).toContain(summary);
    expect(JSON.stringify(h.audits)).not.toContain(privateValue);
    expect(h.runtime.type).not.toHaveBeenCalled();
    expect(h.runtime.uploadFile).not.toHaveBeenCalled();
  });

  it('cancels an active wait when Access is revoked and prevents an old queued action after re-enable', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const pending = h.state.definitions
      .get('browser_wait')!
      .execute({ ms: 10000 }, execution('browser_wait'));
    const cancelled = expect(pending).rejects.toThrow(/abort/i);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const queued = h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.org' }, execution('browser_open'));
    const refused = expect(queued).rejects.toThrow(/Browser Access is off/);
    const oldSignal = h.provider.executionSignal('session-a');
    expect(oldSignal?.aborted).toBe(false);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(oldSignal?.aborted).toBe(true);
    expect(h.provider.executionSignal('session-a')).toBeUndefined();
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    expect(h.provider.executionSignal('session-a')?.aborted).toBe(false);
    expect(h.provider.executionSignal('session-a')).not.toBe(oldSignal);
    await Promise.all([cancelled, refused]);
    expect(h.runtime.open).not.toHaveBeenCalled();
    expect(h.audits.filter((event) => event.outcome === 'error')).toHaveLength(2);
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    expect(h.runtime.open).toHaveBeenCalledTimes(1);
  });

  it('honors caller cancellation during an active wait without revoking Access', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const controller = new AbortController();
    const pending = h.state.definitions
      .get('browser_wait')!
      .execute({ ms: 10000 }, { ...execution('browser_wait'), signal: controller.signal });
    const cancelled = expect(pending).rejects.toThrow(/abort/i);
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await cancelled;
    expect(h.state.registered()).toContain('browser_open');
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_wait', outcome: 'error' });
  });

  it.each(['pause', 'access'] as const)(
    'refuses a queued action when %s changes before execution',
    async (guard) => {
      const h = harness({ access: true, auto: true });
      h.created();
      await h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open'));
      let release: () => void = () => undefined;
      let entered: () => void = () => undefined;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.runtime.click = vi.fn(async () => {
        entered();
        await blocked;
        return { tabId: 'tab-1', url: 'https://example.com/', title: 'Example Domain' };
      });
      const click = h.state.definitions.get('browser_click')!;
      const first = click.execute({ ref: 'e1' }, execution('browser_click'));
      await started;
      const queued =
        guard === 'pause'
          ? click.execute({ ref: 'e2' }, execution('browser_click'))
          : h.state.definitions
              .get('browser_open')!
              .execute({ url: 'https://example.org' }, execution('browser_open'));
      await Promise.resolve();
      await Promise.resolve();
      if (guard === 'pause') h.provider.setTakeover('bot-a', true);
      else {
        h.setAccess(false);
        h.provider.reconcileBot('bot-a');
      }
      const refused = expect(queued).rejects.toThrow(
        guard === 'pause' ? /Browser Pause is active/ : /Browser Access is off/,
      );
      const settledFirst =
        guard === 'access' ? expect(first).rejects.toThrow(/Browser Access is off/) : first;
      release();
      await settledFirst;
      await refused;
      expect(h.runtime.click).toHaveBeenCalledTimes(1);
      expect(h.audits).toHaveLength(3);
      expect(h.audits.filter((event) => event.outcome === 'error')).toHaveLength(
        guard === 'access' ? 2 : 1,
      );
      expect(h.runtime.open).toHaveBeenCalledTimes(1);
      expect(h.audits.at(-1)).toMatchObject({
        tool: guard === 'pause' ? 'browser_click' : 'browser_open',
        outcome: 'error',
      });
      if (guard === 'pause') {
        await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
        h.provider.setTakeover('bot-a', false);
        await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
        await click.execute({ ref: 'e1' }, execution('browser_click'));
        expect(h.runtime.click).toHaveBeenCalledTimes(2);
      }
    },
  );

  it('clicks observed refs, redacts typed text, and clamps scroll and wait', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'e3' }, execution('browser_click'));
    expect(h.runtime.click).toHaveBeenCalledWith('tab-1', 'e3');
    expect(h.audits.at(-1)?.summary).toBe('ref=e3');

    await h.state.definitions
      .get('browser_type')!
      .execute({ ref: 'e2', text: 'hunter2' }, execution('browser_type'));
    expect(h.runtime.type).toHaveBeenCalledWith('tab-1', 'e2', 'hunter2');
    expect(h.audits.at(-1)?.summary).toContain('chars=7');
    expect(JSON.stringify(h.audits)).not.toContain('hunter2');

    await h.state.definitions
      .get('browser_scroll')!
      .execute({ direction: 'down' }, execution('browser_scroll'));
    expect(h.runtime.scroll).toHaveBeenCalledWith('tab-1', 'down', 600);

    const waited = await h.state.definitions
      .get('browser_wait')!
      .execute({ ms: 5 }, execution('browser_wait'));
    expect(JSON.stringify(waited)).toContain('waited 5ms');
  });

  it('clicks by coordinates when no ref is available', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.state.definitions
      .get('browser_click')!
      .execute({ x: 120, y: 340 }, execution('browser_click'));
    expect(h.runtime.clickAt).toHaveBeenCalledWith('tab-1', 120, 340);
    expect(h.audits.at(-1)?.summary).toBe('x=120 y=340');
    await expect(
      h.state.definitions.get('browser_click')!.execute({}, execution('browser_click')),
    ).rejects.toThrow(/ref from browser_observe or x\/y/);
  });

  it('runs a takeover handoff: request pauses, await verifies state and resumes', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const call = (name: string, args: Record<string, unknown>) =>
      h.state.definitions.get(name)!.execute(args, execution(name)) as Promise<{
        content: { text?: string }[];
      }>;
    await call('browser_open', { url: 'https://example.com' });
    const requested = await call('browser_takeover', {
      action: 'request',
      instructions: 'Log in to Example',
    });
    const text = requested.content.map((part) => part.text ?? '').join('\n');
    expect(text).toContain('Takeover link (single-use');
    expect(text).toContain('Post this guiding message to the Human now:');
    expect(h.provider.isTakeover('bot-a')).toBe(true);
    expect(h.audits.at(-1)?.summary).toContain('chars=');
    expect(JSON.stringify(h.audits)).not.toContain('Log in to Example');
    const token = /takeover=([0-9a-f]+)/u.exec(text)?.[1] ?? '';
    expect(token).not.toBe('');
    h.takeovers.accept(token);
    h.takeovers.complete(token, 'done');
    const waited = await call('browser_takeover', { action: 'await', token });
    const doneText = waited.content.map((part) => part.text ?? '').join('\n');
    expect(doneText).toContain('Human finished (done)');
    expect(doneText).toContain('https://example.com/');
    expect(doneText).toContain('Call browser_observe before acting.');
    expect(h.provider.isTakeover('bot-a')).toBe(false);
    const status = await call('browser_takeover', { action: 'status', token });
    expect(status.content.map((part) => part.text ?? '').join()).toContain('completed');
    await expect(call('browser_takeover', { action: 'await', token: 'nope' })).rejects.toThrow(
      /Unknown takeover token/,
    );
  });

  it('keeps the current tab on recoverable errors and drops it on dead targets', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.click = vi.fn(async () => {
      throw new Error(
        'The page has no file input; click the upload control first so the page creates one, then retry',
      );
    });
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e3' }, execution('browser_click')),
    ).rejects.toThrow(/no file input/);
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));

    h.runtime.observe = vi.fn(async () => {
      throw new Error('Target closed');
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/tab is gone/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
  });

  it('audits unsupported key errors, retains current work and permits a native retry', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const press = h.state.definitions.get('browser_press_key')!;
    vi.mocked(h.runtime.pressKey).mockRejectedValueOnce(
      new Error('Unsupported browser key; use Enter'),
    );
    await expect(
      press.execute({ key: 'Control+Enter' }, execution('browser_press_key')),
    ).rejects.toThrow(/Unsupported browser key/);
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.audits.at(-1)).toMatchObject({
      tool: 'browser_press_key',
      outcome: 'error',
      botSlug: 'bot-a',
      sessionId: 'session-a',
      rootRole: 'orchestrator',
    });
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    await press.execute({ key: 'Enter' }, execution('browser_press_key'));
    expect(h.runtime.pressKey).toHaveBeenLastCalledWith('tab-1', 'Enter');
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_press_key', outcome: 'ok' });
  });

  it('surfaces a stale ref readably and audits the failure', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.click = vi.fn(async () => {
      throw new Error('The element ref is stale; call browser_observe again before acting');
    });
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e1' }, execution('browser_click')),
    ).rejects.toThrow(/stale/);
    expect(h.audits).toHaveLength(2);
    expect(h.audits.map((event) => event.outcome)).toEqual(['ok', 'error']);
  });

  it('pauses interaction tools under Browser Pause while observe stays read-only', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.provider.setTakeover('bot-a', true);
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e3' }, execution('browser_click')),
    ).rejects.toThrow(/Browser Pause is active.*Resume.*browser_observe/);
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
  });

  it('manages multiple tabs: opens, lists the current, selects, and closes', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    const opened = await tabs.execute(
      { action: 'open', url: 'https://example.org' },
      execution('browser_tabs'),
    );
    expect(h.runtime.createTab).toHaveBeenCalledWith('https://example.org');
    expect(JSON.stringify(opened)).toContain('tab-2');
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    const listed = await tabs.execute({ action: 'list' }, execution('browser_tabs'));
    expect(JSON.stringify(listed)).toContain('* tab-2');
    const view = await h.provider.listTabs('bot-a');
    expect(view.map((tab) => `${tab.targetId}${tab.current ? '*' : ''}`)).toEqual([
      'tab-1',
      'tab-2*',
    ]);
    expect(h.provider.ownsTab('bot-a', 'tab-2')).toBe(true);
    expect(h.provider.ownsTab('bot-a', 'tab-9')).toBe(false);
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    await tabs.execute({ action: 'close', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.runtime.closeTab).toHaveBeenCalledWith('tab-1');
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
  });

  it('keeps current work and records errors for failed reused and new-tab navigation', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const open = h.state.definitions.get('browser_open')!;
    await open.execute({ url: 'https://example.com' }, execution('browser_open'));
    const failure = new Error(
      'Bot Browser navigation failed (net::ERR_EMPTY_RESPONSE); retry browser_open',
    );
    vi.mocked(h.runtime.open).mockRejectedValueOnce(failure);
    await expect(
      open.execute({ url: 'https://fail.test' }, execution('browser_open')),
    ).rejects.toThrow('ERR_EMPTY_RESPONSE');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_open', outcome: 'error' });
    vi.mocked(h.runtime.createTab).mockRejectedValueOnce(failure);
    await expect(
      h.state.definitions
        .get('browser_tabs')!
        .execute({ action: 'open', url: 'https://fail.test' }, execution('browser_tabs')),
    ).rejects.toThrow('ERR_EMPTY_RESPONSE');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_tabs', outcome: 'error' });
    await open.execute({ url: 'https://example.com' }, execution('browser_open'));
    expect(h.runtime.open).toHaveBeenLastCalledWith('https://example.com', 'tab-1');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenLastCalledWith('tab-1');
  });

  it('retains current work when selecting a Human-closed owned background tab', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    vi.mocked(h.runtime.tabInfo).mockRejectedValueOnce(new Error('No target with given id found'));
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow(/tab is gone.*browser_tabs action list.*browser_open/);
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.ownsTab('bot-a', 'tab-1')).toBe(true);
    expect(h.provider.ownsTab('bot-a', 'tab-2')).toBe(false);
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenLastCalledWith('tab-1');
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'e1' }, execution('browser_click'));
    expect(h.runtime.click).toHaveBeenLastCalledWith('tab-1', 'e1');
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow(/not owned/);
  });

  it('leaves selection and ownership intact on transient tab lookup failure and permits retry', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    vi.mocked(h.runtime.tabInfo).mockRejectedValueOnce(new Error('Temporary lookup timeout'));
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow('Temporary lookup timeout');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    await tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.audits.at(-2)).toMatchObject({ tool: 'browser_tabs', outcome: 'error' });
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_tabs', outcome: 'ok' });
  });

  it('clears only a confirmed dead current target during selection and keeps another owned tab recoverable', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    vi.mocked(h.runtime.tabInfo).mockRejectedValueOnce(new Error('No target with given id found'));
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs')),
    ).rejects.toThrow(/tab is gone/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.provider.ownsTab('bot-a', 'tab-1')).toBe(true);
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
  });

  it('uploads a Host file and audits only its basename', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const uploaded = await h.state.definitions
      .get('browser_upload')!
      .execute({ ref: 'e3', path: '/Users/someone/secret/shot.jpg' }, execution('browser_upload'));
    expect(h.runtime.uploadFile).toHaveBeenCalledWith('tab-1', {
      ref: 'e3',
      path: '/Users/someone/secret/shot.jpg',
    });
    expect(JSON.stringify(uploaded)).toContain('shot.jpg');
    expect(h.audits.at(-1)?.summary).toContain('file=shot.jpg');
    expect(JSON.stringify(h.audits)).not.toContain('/Users/someone');
  });

  it('idle closes revoke the old registration and Session grant before any new browser operation', async () => {
    const h = harness({ access: true });
    h.created();
    h.provider.markAuthorized('session-a');
    const old = h.provider.executionSignal('session-a')!;
    const tool = h.state.definitions.get('browser_open')!;
    await tool.execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.provider.closeIdleTabs(0);
    expect(old.aborted).toBe(true);
    expect(h.provider.executionSignal('session-a')).not.toBe(old);
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    await expect(
      tool.execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow();
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/approval|authorized/);
    expect(h.runtime.open).toHaveBeenCalledOnce();
  });
  it('rejects foreign tabs and closes idle tabs without stopping the browser', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-9' }, execution('browser_tabs')),
    ).rejects.toThrow(/not owned/);
    h.provider.touch('bot-a');
    await h.provider.closeIdleTabs(60_000);
    expect(h.provider.tabCount('bot-a')).toBe(1);
    await h.provider.closeIdleTabs(0);
    expect(h.runtime.closeTab).toHaveBeenCalledWith('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(0);
  });

  it('recovers from a human-closed current tab through tabs list and select', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    const original = h.runtime.observe;
    h.runtime.observe = vi.fn(async (tabId: string) => {
      if (tabId === 'tab-1') throw new Error('target closed');
      return original(tabId);
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/browser_tabs/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
    await tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
  });

  it.each(['target closed', 'Session with given id not found.'])(
    'drops a dead tab and recovers after %s',
    async (message) => {
      const h = harness({ access: true, auto: true });
      h.created();
      await h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open'));
      h.runtime.observe = vi.fn(async () => {
        throw new Error(message);
      });
      await expect(
        h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
      ).rejects.toThrow(/browser_tabs.*browser_open/);
      expect(h.audits.at(-1)?.outcome).toBe('error');
      expect(h.provider.currentTab('bot-a')).toBeUndefined();
      vi.mocked(h.runtime.open).mockResolvedValueOnce({
        tabId: 'tab-recovered',
        url: 'https://recover.test',
        title: 'Recovered',
      });
      await h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://recover.test' }, execution('browser_open'));
      expect(h.runtime.open).toHaveBeenLastCalledWith('https://recover.test', undefined);
      expect(h.provider.currentTab('bot-a')).toBe('tab-recovered');
      expect(h.audits.at(-1)?.outcome).toBe('ok');
    },
  );

  it('fails when access is turned off mid-session, and audits the error', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    h.setAccess(false);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/Browser Access is off/);
    expect(h.runtime.open).not.toHaveBeenCalled();
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      outcome: 'error',
      error: 'Browser Access is off for this PersonaBot',
    });
  });

  it('serializes one Bot’s actions while it is busy', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    let active = 0;
    let peak = 0;
    h.runtime.open = vi.fn(async (url: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { tabId: 'tab-1', url, title: '' };
    });
    const open = h.state.definitions.get('browser_open')!;
    await Promise.all([
      open.execute({ url: 'https://a.example' }, execution('browser_open')),
      open.execute({ url: 'https://b.example' }, execution('browser_open')),
      open.execute({ url: 'https://c.example' }, execution('browser_open')),
    ]);
    expect(peak).toBe(1);
  });

  it('drops registrations when Browser Access is turned off, and stops the browser on dispose', async () => {
    const h = harness({ access: true });
    h.created();
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
    await h.provider.dispose();
    expect(h.runtimes.stopAll).toHaveBeenCalled();
  });
});

describe('Human Browser window reveal', () => {
  async function ownedTabs(h: Harness) {
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.state.definitions
      .get('browser_tabs')!
      .execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    vi.mocked(h.runtime.openWindow).mockImplementation(async (tabId) => ({
      tabId: tabId ?? 'tab-9',
      url: 'about:blank',
      title: '',
    }));
  }

  it('keeps owned work tabs through Access revocation and resumes on the same current page', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    const capturedClick = h.state.definitions.get('browser_click')!;
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
    await expect(capturedClick.execute({ ref: 'e1' }, execution('browser_click'))).rejects.toThrow(
      'Browser Access is off',
    );
    expect(h.runtime.click).not.toHaveBeenCalled();
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    expect(h.provider.ownsTab('bot-a', 'tab-1')).toBe(true);
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toContain('browser_observe');
    await h.provider.openForHuman('bot-a');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-2');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenCalledWith('tab-2');
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'e1' }, execution('browser_click'));
    expect(h.runtime.click).toHaveBeenCalledWith('tab-2', 'e1');
  });

  it('retains closed-tab recovery after an Access cycle and still clears ownership on reset', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    vi.mocked(h.runtime.listTabs).mockResolvedValue([
      { targetId: 'tab-1', url: 'https://example.com/', title: 'Example' },
      { targetId: 'foreign', url: 'https://example.net/', title: 'Foreign' },
    ]);
    await h.provider.openForHuman('bot-a');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-1');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
    h.provider.resetBot('bot-a');
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(0);
  });

  it('reveals the manually previewed owned tab without changing the Bot pointer', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    h.provider.setTakeover('bot-a', true);
    await expect(h.provider.openForHuman('bot-a', 'tab-1')).resolves.toMatchObject({
      tabId: 'tab-1',
    });
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-1');
    expect(h.provider.isTakeover('bot-a')).toBe(true);
  });

  it('ignores a foreign requested target and reveals the current owned tab', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    await h.provider.openForHuman('bot-a', 'foreign');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-2');
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
  });

  it('prunes closed tabs and reuses a live owned fallback', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    vi.mocked(h.runtime.listTabs).mockResolvedValue([
      { targetId: 'foreign', url: 'https://example.net/', title: 'Foreign' },
      { targetId: 'tab-1', url: 'https://example.com/', title: 'Example' },
    ]);
    await h.provider.openForHuman('bot-a', 'tab-2');
    expect(h.runtime.openWindow).toHaveBeenCalledWith('tab-1');
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(1);
    expect(h.provider.ownsTab('bot-a', 'foreign')).toBe(false);
  });

  it('adopts a single blank target and reuses it across concurrent Human opens with Access off', async () => {
    const h = harness({ access: false });
    vi.mocked(h.runtime.listTabs).mockImplementation(async () =>
      h.provider.ownsTab('bot-a', 'tab-9')
        ? [{ targetId: 'tab-9', url: 'about:blank', title: '' }]
        : [],
    );
    vi.mocked(h.runtime.openWindow).mockImplementation(async (tabId) => ({
      tabId: tabId ?? 'tab-9',
      url: 'about:blank',
      title: '',
    }));
    const opened = await Promise.all(
      Array.from({ length: 3 }, () => h.provider.openForHuman('bot-a')),
    );
    expect(opened.map((tab) => tab.tabId)).toEqual(['tab-9', 'tab-9', 'tab-9']);
    expect(vi.mocked(h.runtime.openWindow).mock.calls).toEqual([[undefined], ['tab-9'], ['tab-9']]);
    expect(h.provider.currentTab('bot-a')).toBe('tab-9');
    expect(h.provider.tabCount('bot-a')).toBe(1);
  });

  it('replaces the last closed owned tab without adopting a live foreign target', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    vi.mocked(h.runtime.listTabs).mockResolvedValue([
      { targetId: 'foreign', url: 'https://example.net/', title: 'Foreign' },
    ]);
    await h.provider.openForHuman('bot-a');
    expect(h.runtime.openWindow).toHaveBeenCalledWith(undefined);
    expect(h.provider.currentTab('bot-a')).toBe('tab-9');
    expect(h.provider.tabCount('bot-a')).toBe(1);
  });

  it('leaves ownership unchanged when the runtime cannot list tabs', async () => {
    const h = harness({ access: true, auto: true });
    await ownedTabs(h);
    vi.mocked(h.runtime.listTabs).mockRejectedValue(new Error('CDP unavailable'));
    await expect(h.provider.openForHuman('bot-a')).rejects.toThrow('CDP unavailable');
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    expect(h.runtime.openWindow).not.toHaveBeenCalled();
  });
});

describe('browser Provider public Activity detail', () => {
  it('registers explicit operation-only detail on the actual scoped tabs Tool', () => {
    const h = harness({ access: true });
    h.created();
    const tabs = h.state.definitions.get('browser_tabs')!;
    const input = {
      action: 'open',
      url: 'https://private.example/?token=secret',
      targetId: 'private-tab',
      title: 'private title',
    };
    expect(readPublicToolDetail(tabs, input)).toBe('Opening a new browser tab');
    expect(readPublicToolDetail(tabs, { ...input, action: 'close' })).toBe('Closing a browser tab');
    expect(readPublicToolDetail(tabs, { action: 'private-action' })).toBeUndefined();
    expect(readPublicToolDetail(h.state.definitions.get('browser_open')!, input)).toBeUndefined();
    expect(JSON.stringify(readPublicToolDetail(tabs, input))).not.toMatch(
      /private|secret|token|targetId/,
    );
  });
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

it('Profile control exposes only its curated tools and rejects foreign Sessions, Pause and Access-off', async () => {
  const command = vi.fn(async () => ({
    url: 'https://example.com',
    title: 'Example',
    text: 'Visible',
    elements: [],
  }));
  const h = harness({ access: true, profile: () => ({ command }) });
  h.created();
  expect(h.state.registered()).toEqual([
    'browser_click',
    'browser_observe',
    'browser_open',
    'browser_tabs',
    'browser_type',
  ]);
  const observe = h.state.definitions.get('browser_observe')!;
  await expect(observe.execute({}, execution('browser_observe'))).rejects.toThrow('not authorized');
  h.provider.markAuthorized('session-a');
  await expect(
    observe.execute(
      {},
      { ...execution('browser_observe'), agent: { id: 'foreign' } as unknown as Agent },
    ),
  ).rejects.toThrow('owning');
  await observe.execute({}, execution('browser_observe'));
  h.provider.setTakeover('bot-a', true);
  const type = h.state.definitions.get('browser_type')!;
  await expect(type.execute({ ref: 'x', text: 'y' }, execution('browser_type'))).rejects.toThrow(
    'Pause',
  );
  h.provider.setTakeover('bot-a', false);
  await expect(type.execute({ ref: 'x', text: 'y' }, execution('browser_type'))).rejects.toThrow(
    'fresh',
  );
  h.setAccess(false);
  await expect(observe.execute({}, execution('browser_observe'))).rejects.toThrow('Access');
  expect(command).toHaveBeenCalledOnce();
});

it('Profile reconnect preserves Pause while revoking Session authority and observations', async () => {
  const h = harness({ access: true, profile: () => ({ command: vi.fn() }) });
  h.created();
  h.provider.markAuthorized('session-a');
  h.provider.setTakeover('bot-a', true);
  h.provider.invalidateBot('bot-a');
  expect(h.provider.isTakeover('bot-a')).toBe(true);
  expect(h.provider.needsAuthorization('session-a')).toBe(true);
  h.provider.markAuthorized('session-a');
  const type = h.state.definitions.get('browser_type')!;
  await expect(
    type.execute({ ref: 'old', text: 'refused' }, execution('browser_type')),
  ).rejects.toThrow('Pause');
  h.provider.setTakeover('bot-a', false);
  await expect(
    type.execute({ ref: 'old', text: 'refused' }, execution('browser_type')),
  ).rejects.toThrow('fresh');
});

it('a Profile observation spanning Pause and Resume cannot authorize later mutation', async () => {
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const observation = {
    url: 'https://example.com',
    title: 'Example',
    text: 'Visible',
    elements: [],
  };
  const command = vi.fn(async () => observation);
  command.mockImplementationOnce(async () => {
    started();
    await pending;
    return observation;
  });
  const h = harness({ access: true, auto: true, profile: () => ({ command }) });
  h.created();
  const call = (name: string, args = {}) =>
    h.state.definitions.get(name)!.execute(args, execution(name));
  const oldRead = call('browser_observe');
  const refused = expect(oldRead).rejects.toThrow('control changed');
  await entered;
  h.provider.setTakeover('bot-a', true);
  h.provider.setTakeover('bot-a', false);
  release();
  await refused;
  await expect(call('browser_type', { ref: 'old', text: 'refused' })).rejects.toThrow('fresh');
  expect(command).toHaveBeenCalledTimes(1);
  await call('browser_observe');
  await call('browser_type', { ref: 'fresh', text: 'allowed' });
  expect(command).toHaveBeenCalledTimes(3);
});
