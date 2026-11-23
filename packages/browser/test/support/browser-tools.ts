import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vi, type Mock } from 'vitest';

import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { BotBrowserRuntime } from '../../src/runtime/browser.js';
import { createTakeoverService } from '../../src/takeover.js';
import { createBrowserToolProvider, type BrowserAuditEvent } from '../../src/tool/provider.js';

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

export interface Harness {
  readonly provider: ReturnType<typeof createBrowserToolProvider>;
  readonly scope: Context;
  readonly state: FakeScope;
  readonly runtime: BotBrowserRuntime;
  readonly runtimes: {
    readonly stopAll: Mock<() => Promise<void>>;
  };
  readonly audits: BrowserAuditEvent[];
  readonly takeovers: ReturnType<typeof createTakeoverService>;
  readonly screenshotDir: string;
  created(): void;
  setAccess(enabled: boolean): void;
  setAuto(allow: boolean): void;
}

export const screenshotDirs: string[] = [];

export function harness(options: {
  access: boolean;
  auto?: boolean;
  daily?: Parameters<typeof createBrowserToolProvider>[0]['daily'];
  profile?: Parameters<typeof createBrowserToolProvider>[0]['profile'];
  borrowed?: Parameters<typeof createBrowserToolProvider>[0]['borrowed'];
  takeover?: Parameters<typeof createBrowserToolProvider>[0]['takeover'];
  desktopControl?: Parameters<typeof createBrowserToolProvider>[0]['desktopControl'];
  note?: (detail: string) => void;
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
    ...(options.desktopControl === undefined ? {} : { desktopControl: options.desktopControl }),
    ...(options.note === undefined ? {} : { note: options.note }),
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

export function execution(name: string): ToolRunContext {
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
