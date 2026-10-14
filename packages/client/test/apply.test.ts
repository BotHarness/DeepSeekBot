import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconCodeOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: stub,
    MenuItemButton: stub,
    IconAgentPresetOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEditOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconTriangleRightFill14: stub,
    IconTrashOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    Input: stub,
    Menu: stub,
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import { apply, PANEL_ID } from '../src/client/index.js';
import { store } from '../src/client/store.js';
import { WindowCompanions } from '../src/client/window-companions.js';

interface Spec {
  name: string;
  id?: string;
  key?: string;
  priority?: number;
  order?: number;
  label?: string;
  inject?: () => unknown;
  children?: Record<string, unknown>;
}

interface FakeScope {
  getSnapshot(): {
    status: 'ready';
    value: {
      motionPreference: 'system';
      sortMode: 'updated';
      sortModes: Record<string, never>;
    };
    user: Record<string, never>;
    writable: boolean;
    mode: 'host';
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  mutate(ops: readonly unknown[]): Promise<void>;
}

function fakeScope(): FakeScope {
  return {
    getSnapshot: () => ({
      status: 'ready',
      value: {
        botIcon: 'mascot' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        motionPreference: 'system',
        sortMode: 'updated',
        sortModes: {},
      },
      user: {},
      writable: true,
      mode: 'host',
    }),
    subscribe: () => () => undefined,
    set: async () => undefined,
    mutate: async () => undefined,
  };
}

function createScoped(specs: Spec[], disposed: Spec[], withSettings = false, withPanelInfo = true) {
  const scoped: Record<string, unknown> = {
    slots: {
      inject: (_name: string, callback: () => unknown) => callback(),
      register: (spec: Spec) => {
        specs.push(spec);
        return () => {
          disposed.push(spec);
        };
      },
    },
    remote: {
      session: {
        canOpenWorkspacePath: async () => ({ ok: true, value: false }),
        workspacePathApplications: async () => ({ ok: true, value: [] }),
        openWorkspacePath: async () => ({ ok: true, value: { opened: true } }),
      },
    },
    connection: {
      rpc: {
        call: async () => ({ ok: true, value: { bots: [], channels: [] } }),
      },
    },
    layout: {
      selectPanel: () => undefined,
      ...(withPanelInfo
        ? {
            panelInfo: {
              getSnapshot: () => ({ activePanelId: null }),
              subscribe: () => () => undefined,
            },
          }
        : {}),
    },
    inputTriggers: {
      registerSource: () => () => undefined,
    },
    locale: {
      register: () => () => undefined,
      bind: () => (key: string) => key,
      subscribe: () => () => undefined,
    },
    provide: () => () => undefined,
    effect: (callback: () => unknown) => {
      callback();
      return () => undefined;
    },
    inject: (_deps: string[], callback: (ctx: unknown) => unknown) => {
      if (withSettings) {
        callback({ ...scoped, configForms: { get: () => fakeScope() } });
      }
      return () => undefined;
    },
  };
  return scoped;
}

describe('client apply', () => {
  it('mirrors companion health only on transitions and clears stale health when unpinned', async () => {
    const streams: EventTarget[] = [];
    vi.stubGlobal('fetch', async () => Response.json({ profileId: 'qa' }));
    vi.stubGlobal(
      'EventSource',
      class extends EventTarget {
        constructor() {
          super();
          streams.push(this);
        }
        close() {}
      },
    );
    store.setMode('dsh');
    store.setActivitySync('live');
    const calls = vi.spyOn(store, 'setActivitySync');
    const specs: Spec[] = [];
    let companion: WindowCompanions | undefined;
    try {
      apply(createScoped(specs, []) as never);
      const value = specs.find((spec) => spec.name === 'shell.overlay')?.inject?.();
      if (
        typeof value !== 'object' ||
        value === null ||
        !('companion' in value) ||
        !(value.companion instanceof WindowCompanions)
      )
        throw new Error('Companion overlay unavailable');
      companion = value.companion;
      await vi.waitFor(() => expect(companion!.getSnapshot().ready).toBe(true));
      store.setRosterStatus('loading', undefined);
      calls.mockClear();
      companion.select('ada');
      await vi.waitFor(() => expect(streams).toHaveLength(1));
      streams[0]!.dispatchEvent(new Event('error'));
      companion.get('ada')!.reading(true);
      companion.get('ada')!.configure({ walking: false });
      expect(calls.mock.calls).toEqual([['stale']]);
      companion.remove('ada');
      expect(store.getSnapshot().activitySync).toBe('live');
      expect(calls.mock.calls).toEqual([['stale'], ['live']]);
    } finally {
      companion?.dispose();
      calls.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it('registers the bot-mode entry, the main panel, and the mode shadows', () => {
    store.setMode('dsh');
    const registrations: Spec[] = [];
    const disposed: Spec[] = [];
    apply(createScoped(registrations, disposed) as never);
    expect(registrations[0]).toMatchObject({
      name: 'shell.overlay',
      id: 'botharness-window-companion',
      locale: 'botharness',
      inject: expect.any(Function),
    });
    expect(registrations[1]).toMatchObject({
      name: 'shell.overlay',
      id: 'botharness-bot-settings',
    });
    const specs = registrations.slice(2);

    expect(specs.map((spec) => spec.name)).toEqual([
      'sidebar.panellist',
      'main',
      'conversation.session.header.actions',
      'sidebar.session.row.leading',
      'sidebar.workspaces.session.menu.item',
    ]);
    expect(specs[0]).toMatchObject({
      id: PANEL_ID,
      order: 10,
      label: expect.any(Function),
      locale: 'botharness',
    });
    expect(specs[1]).toMatchObject({ key: PANEL_ID });

    expect(specs[2]).toMatchObject({
      name: 'conversation.session.header.actions',
      id: 'botharness-return-to-bot',
      order: 15,
      locale: 'botharness',
    });
    expect(specs[3]).toMatchObject({
      name: 'sidebar.session.row.leading',
      id: 'botharness-session-owner-avatar',
      order: 20,
      locale: 'botharness',
    });
    expect(specs[4]).toMatchObject({
      name: 'sidebar.workspaces.session.menu.item',
      id: 'botharness-return-to-bot-menu',
      order: 500,
      locale: 'botharness',
    });

    store.setMode('bot');
    specs.splice(0, specs.length, ...registrations.slice(2));
    expect(specs.map((spec) => spec.name)).toEqual([
      'sidebar.panellist',
      'main',
      'conversation.session.header.actions',
      'sidebar.session.row.leading',
      'sidebar.workspaces.session.menu.item',
      'sidebar.workspaces',
      'main',
    ]);
    expect(specs[5]).toMatchObject({
      name: 'sidebar.workspaces',
      priority: -100,
      locale: 'botharness',
    });
    expect(specs[6]).toMatchObject({ name: 'main', key: 'conversation', priority: -100 });

    store.setMode('dsh');
    expect(disposed.map((spec) => spec.name)).toEqual(['sidebar.workspaces', 'main']);
    expect(disposed).not.toContain(registrations[0]);
    expect(disposed).not.toContain(registrations[1]);
  });

  it('registers Bot Settings on the overlay and its sections only while configForms is served', () => {
    store.setMode('dsh');
    const specs: Spec[] = [];
    const disposed: Spec[] = [];
    apply(createScoped(specs, disposed, true) as never);

    expect(specs.find((spec) => spec.id === 'botharness-bot-settings')).toMatchObject({
      name: 'shell.overlay',
      locale: 'botharness',
      inject: expect.any(Function),
      children: { 'botharness.settings.section': { kind: 'list', scope: 'root' } },
    });
    const sections = specs.filter((spec) => spec.name === 'botharness.settings.section');
    expect(sections.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: 'general', order: 0 },
      { id: 'models', order: 10 },
      { id: 'messaging', order: 20 },
      { id: 'im-apps', order: 25 },
      { id: 'companions', order: 40 },
      { id: 'devices', order: 45 },
      { id: 'data-privacy', order: 50 },
      { id: 'advanced', order: 60 },
      { id: 'about', order: 70 },
    ]);
    for (const section of sections) {
      expect(section).toMatchObject({ locale: 'botharness', label: expect.any(Function) });
      expect(section.inject).toBeTypeOf('function');
    }

    const native = specs.find((spec) => spec.name === 'settings.section');
    expect(native).toMatchObject({ id: 'botharness', order: 25, locale: 'botharness' });
    expect(native?.children).toBeUndefined();
    expect(native?.label).toBeTypeOf('function');

    const withoutSettings: Spec[] = [];
    apply(createScoped(withoutSettings, []) as never);
    expect(withoutSettings.some((spec) => spec.name === 'settings.section')).toBe(false);
    expect(withoutSettings.some((spec) => spec.name === 'botharness.settings.section')).toBe(false);
    expect(withoutSettings.some((spec) => spec.id === 'botharness-bot-settings')).toBe(true);
  });

  it('opens Bot Settings from each entry point at its section', () => {
    store.setMode('dsh');
    const specs: Spec[] = [];
    apply(createScoped(specs, [], true) as never);
    const overlay = specs.find((spec) => spec.id === 'botharness-bot-settings');
    const { botSettings } = overlay?.inject?.() as {
      botSettings: { getSnapshot(): { open: boolean; sectionId?: string }; close(): void };
    };
    const panel = specs.find((spec) => spec.name === 'sidebar.panellist');
    (panel?.inject?.() as { openSettings(): void }).openSettings();
    expect(botSettings.getSnapshot().open).toBe(true);

    botSettings.close();
    const companion = specs.find((spec) => spec.id === 'botharness-window-companion');
    (companion?.inject?.() as { openSettings(): void }).openSettings();
    expect(botSettings.getSnapshot()).toEqual({ open: true, sectionId: 'companions' });

    botSettings.close();
    const main = specs.find((spec) => spec.name === 'main' && spec.key === PANEL_ID);
    (
      main?.inject?.() as { telemetryNotice: { openSettings(): void } }
    ).telemetryNotice.openSettings();
    expect(botSettings.getSnapshot()).toEqual({ open: true, sectionId: 'data-privacy' });

    botSettings.close();
    const native = specs.find((spec) => spec.name === 'settings.section');
    (native?.inject?.() as { openBotSettings(): void }).openBotSettings();
    expect(botSettings.getSnapshot().open).toBe(true);
  });

  it('boots without the panelInfo facet, skipping view-persist', () => {
    store.setMode('dsh');
    const specs: Spec[] = [];
    const disposed: Spec[] = [];
    expect(() => apply(createScoped(specs, disposed, false, false) as never)).not.toThrow();
    expect(specs.map((spec) => spec.name)).toContain('sidebar.panellist');
    expect(specs.map((spec) => spec.name)).toContain('main');
  });
});
