import { describe, expect, it, vi } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { BridgeCallError, type BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';
import { bridgeCall, BOT, GROUP, DM, setup } from './bridge-helpers.js';

describe('bridge actions', () => {
  it('renames a DM Channel and its PersonaBot projection without changing either id', async () => {
    const { clientStore, actions } = setup();
    await actions.load();
    await actions.openBot('ada');

    await expect(actions.renameChannel('dm-ada', 'Ada Lovelace')).resolves.toBe(true);

    const state = clientStore.getSnapshot();
    expect(state.bots.find((bot) => bot.slug === 'ada')).toMatchObject({
      slug: 'ada',
      displayName: 'Ada Lovelace',
    });
    expect(state.channels.find((channel) => channel.id === 'dm-ada')?.name).toBe('Ada Lovelace');
    expect(state.conversation.channel?.name).toBe('Ada Lovelace');
  });

  it('pins and unpins group and DM Channels through the durable roster before refreshing', async () => {
    const writes: string[][] = [];
    let pins: string[] = [];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet: (payload) => {
        pins = [...(payload['pins'] as string[])];
        writes.push(pins);
        return { pins };
      },
    });
    await actions.load();

    await expect(actions.setChannelPinned('group-team', true)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['group-team']);
    await expect(actions.setChannelPinned('group-team', true)).resolves.toBe(true);
    expect(writes).toEqual([['group-team']]);

    await expect(actions.setChannelPinned('dm-ada', true)).resolves.toBe(true);
    await expect(actions.setChannelPinned('group-team', false)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['dm-ada']);
    expect(writes).toEqual([['group-team'], ['group-team', 'dm-ada'], ['dm-ada']]);
  });

  it('switches pinned scope to manual even when the drop matches stored pin order', async () => {
    const pins = ['group-team', 'dm-ada'];
    const pinsSet = vi.fn(() => ({ pins }));
    const { actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet,
    });
    await actions.load();

    const beforePublish = vi.fn();
    await expect(actions.reorderPinnedChannels([...pins], beforePublish)).resolves.toBe(true);
    expect(beforePublish).toHaveBeenCalledOnce();
    expect(pinsSet).not.toHaveBeenCalled();
  });

  it('hides and restores a Channel without changing its pin, section, or flat order', async () => {
    const writes: string[][] = [];
    let hidden: string[] = [];
    const pins = ['group-team'];
    const sections = [{ id: 's1', name: 'A', channelIds: ['group-team'] }];
    const topOrder = [{ kind: 'section' as const, id: 's1' }];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, hidden, sections, topOrder }),
      hiddenSet: (payload) => {
        hidden = [...(payload['hidden'] as string[])];
        writes.push(hidden);
        return { hidden };
      },
    });
    await actions.load();

    await expect(actions.setChannelHidden('group-team', true)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins,
      hidden: ['group-team'],
      sections,
      topOrder,
    });
    await expect(actions.setChannelHidden('group-team', true)).resolves.toBe(true);
    expect(writes).toEqual([['group-team']]);

    await expect(actions.setChannelHidden('group-team', false)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins,
      hidden: [],
      sections,
      topOrder,
    });
    expect(writes).toEqual([['group-team'], []]);
  });

  it('unpins and places a Channel inside a section before one roster refresh', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let reads = 0;
    let pins = ['group-team'];
    let channelIds = ['dm-ada'];
    const { clientStore, actions } = setup({
      rosterGet: () => {
        reads += 1;
        return { pins, sections: [{ id: 's1', name: 'A', channelIds }], topOrder: [] };
      },
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
        return {};
      },
      pinsSet: (payload) => {
        calls.push({ endpoint: 'pinsSet', payload });
        pins = [...(payload['pins'] as string[])];
        return { pins };
      },
    });
    await actions.load();

    await expect(
      actions.movePinnedChannel('group-team', 's1', ['group-team', 'dm-ada']),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      {
        endpoint: 'channelAssign',
        payload: { channelId: 'group-team', sectionId: 's1', index: 0 },
      },
      {
        endpoint: 'channelAssign',
        payload: { channelId: 'dm-ada', sectionId: 's1', index: 1 },
      },
      { endpoint: 'pinsSet', payload: { pins: [] } },
    ]);
    expect(reads).toBe(2);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins: [],
      sections: [{ id: 's1', channelIds: ['group-team', 'dm-ada'] }],
    });
  });

  it('unpins and places a Channel at an exact loose top-level position', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let pins = ['group-team'];
    let topOrder: Array<{ kind: 'section' | 'channel'; id: string }> = [
      { kind: 'section', id: 's1' },
    ];
    let channelIds = ['group-team'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins,
        sections: [{ id: 's1', name: 'A', channelIds }],
        topOrder,
      }),
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        channelIds = channelIds.filter((id) => id !== payload['channelId']);
        return {};
      },
      topReorder: (payload) => {
        calls.push({ endpoint: 'topReorder', payload });
        topOrder = payload['order'] as typeof topOrder;
        return { topOrder };
      },
      pinsSet: (payload) => {
        calls.push({ endpoint: 'pinsSet', payload });
        pins = [...(payload['pins'] as string[])];
        return { pins };
      },
    });
    await actions.load();

    await expect(
      actions.movePinnedChannelToFlat('group-team', [
        { kind: 'channel', id: 'group-team' },
        { kind: 'section', id: 's1' },
      ]),
    ).resolves.toBe(true);

    expect(calls.map((call) => call.endpoint)).toEqual(['channelAssign', 'topReorder', 'pinsSet']);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins: [],
      topOrder: [
        { kind: 'channel', id: 'group-team' },
        { kind: 'section', id: 's1' },
      ],
    });
  });

  it('canonicalises legacy PersonaBot-slug pins to their DM Channel ids', async () => {
    const writes: string[][] = [];
    let pins = ['ada'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet: (payload) => {
        pins = [...(payload['pins'] as string[])];
        writes.push(pins);
        return { pins };
      },
    });
    await actions.load();

    await expect(actions.ensureChannelPins()).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['dm-ada']);
    expect(writes).toEqual([['dm-ada']]);
  });

  it('creates a group channel, selects it, and surfaces failures', async () => {
    const { clientStore, actions } = setup();
    await actions.load();

    const channel = await actions.createGroup({ name: 'Team' });

    expect(channel?.id).toBe('group-team');
    const state = clientStore.getSnapshot();
    expect(state.channels[0]?.id).toBe('group-team');
    expect(state.selection).toEqual({ kind: 'channel', channelId: 'group-team' });
    expect(state.conversation.status).toBe('ready');
    expect(state.roster.topOrder?.[0]).toEqual({ kind: 'channel', id: 'group-team' });

    const failing = createActions(
      bridgeCall({
        list: () => ({ bots: [] }),
        channels: () => ({ channels: [] }),
        channelCreate: () => {
          throw new Error('bridge down');
        },
      }),
      clientStore,
    );
    await expect(failing.createGroup({ name: 'Nope' })).rejects.toThrow('bridge down');
  });

  it('creates a group channel as the first row of a target section', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    const { actions } = setup({
      channelAssign: (payload) => {
        assignments.push(payload);
        return {};
      },
    });
    await actions.load();

    await actions.createGroup({ name: 'Team', sectionId: 'section-work' });

    expect(assignments).toEqual([{ channelId: 'group-team', sectionId: 'section-work', index: 0 }]);
  });

  it.each([undefined, 'section-work'])(
    'discards a scoped roster refresh after the connection changes (section %s)',
    async (sectionId) => {
      let startRead: (() => void) | undefined;
      let finishRead: (() => void) | undefined;
      const reading = new Promise<void>((resolve) => {
        startRead = resolve;
      });
      const release = new Promise<void>((resolve) => {
        finishRead = resolve;
      });
      const reads = {
        rosterGet: async () => {
          startRead?.();
          await release;
          return { pins: [GROUP.id], sections: [] };
        },
        channels: () => ({ channels: [DM] }),
        list: () => ({ bots: [BOT] }),
        composerIdentity: () => ({ hostId: 'old-host', profileId: 'profile', humanId: 'human' }),
      };
      const defaultCall = vi.fn(bridgeCall(reads));
      const scopedCall = bridgeCall({
        ...reads,
        channelCreate: () => ({ channel: GROUP }),
        topReorder: () => ({}),
        channelAssign: () => ({}),
      });
      let current = true;
      scopedCall.assertCurrent = () => {
        if (!current) throw new BridgeCallError('connection-host-changed', 'Connection changed');
      };
      const clientStore = createStore();
      const actions = createActions(defaultCall, clientStore);
      const rejected = expect(
        actions.createGroup({ name: 'Team', sectionId, scopedCall }),
      ).rejects.toMatchObject({ code: 'connection-host-changed' });
      await reading;
      const snapshot = clientStore.getSnapshot();
      current = false;
      finishRead?.();
      await rejected;
      expect(clientStore.getSnapshot()).toBe(snapshot);
      expect(defaultCall).not.toHaveBeenCalled();
    },
  );

  it('routes Git-backed creation through its async Host endpoint and opens the DM', async () => {
    const imports: Array<Record<string, unknown>> = [];
    const { actions, clientStore } = setup({
      list: () => ({
        bots:
          imports.length === 0 ? [BOT] : [{ ...BOT, ...imports.at(-1), slug: 'bot-imported' }, BOT],
      }),
      createFromGit: (payload) => {
        imports.push(payload);
        return { bot: { ...BOT, slug: 'bot-imported', displayName: payload['displayName'] } };
      },
      channelDm: () => ({ channel: { ...DM, id: 'dm-bot-imported', botSlug: 'bot-imported' } }),
    });
    await actions.load();

    const created = await actions.createBot({
      displayName: 'Imported',
      roles: [],
      gitUrl: 'https://github.com/owner/memory.git',
    });

    expect(imports).toEqual([
      { displayName: 'Imported', roles: [], gitUrl: 'https://github.com/owner/memory.git' },
    ]);
    expect(created.slug).toBe('bot-imported');
    expect(clientStore.getSnapshot().selection).toEqual({ kind: 'bot', slug: 'bot-imported' });
    await expect(actions.send('What is in your memory?')).resolves.toBe(true);
  });

  it('creates a PersonaBot DM as the first row of a target section', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    const { actions } = setup({
      create: () => ({ bot: { ...BOT, slug: 'bot-generated' } }),
      channelDm: () => ({ channel: { ...DM, id: 'dm-bot-generated', botSlug: 'bot-generated' } }),
      channelAssign: (payload) => {
        assignments.push(payload);
        return {};
      },
    });
    await actions.load();

    await actions.createBot({ displayName: '小研', roles: [] }, 'section-work');

    expect(assignments).toEqual([
      { channelId: 'dm-bot-generated', sectionId: 'section-work', index: 0 },
    ]);
  });

  it('reports roster failures without throwing', async () => {
    const failing: BridgeCall = async () => ({
      ok: false,
      error: { code: 'unavailable', message: 'RPC is not available', details: {} },
    });
    const clientStore = createStore();

    await createActions(failing, clientStore).load();

    expect(clientStore.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'RPC is not available',
    });
  });

  it('keeps successful roster metadata when the channel refresh fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let failChannels = false;
    let pins: string[] = [];
    const { clientStore, actions } = setup({
      channels: () => {
        if (failChannels) throw new Error('channel read failed');
        return { channels: [GROUP, DM] };
      },
      rosterGet: () => ({ pins, sections: [] }),
    });
    try {
      await actions.load();
      failChannels = true;
      pins = ['ada'];
      await actions.refreshRoster();
      expect(clientStore.getSnapshot().roster.pins).toEqual(['ada']);
      expect(clientStore.getSnapshot().channels.map((channel) => channel.id)).toEqual([
        GROUP.id,
        DM.id,
      ]);
      expect(clientStore.getSnapshot().roster.readOnly).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('removes a deleted Group locally even when the reload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let failChannels = false;
    const { clientStore, actions } = setup({
      channels: () => {
        if (failChannels) throw new Error('channel read failed');
        return { channels: [GROUP, DM] };
      },
      channelGroupDelete: () => ({ deleted: true }),
    });
    try {
      await actions.load();
      clientStore.select({ kind: 'channel', channelId: GROUP.id });
      clientStore.setConversation({ channel: GROUP });
      failChannels = true;
      await expect(actions.deleteGroupChannel(GROUP.id)).resolves.toBe(true);
      expect(clientStore.getSnapshot().selection).toBeUndefined();
      expect(clientStore.getSnapshot().channels.map((channel) => channel.id)).toEqual([DM.id]);
    } finally {
      warn.mockRestore();
    }
  });

  it('closes the open Channel when a refresh no longer lists it, but keeps one not yet listed', async () => {
    let channels = [GROUP, DM];
    const { clientStore, actions } = setup({ channels: () => ({ channels }) });
    await actions.load();
    clientStore.select({ kind: 'channel', channelId: GROUP.id });
    clientStore.setConversation({ channel: GROUP });
    channels = [DM];
    await actions.refreshRoster();
    expect(clientStore.getSnapshot().selection).toBeUndefined();
    expect(clientStore.getSnapshot().conversation.channel).toBeUndefined();

    const fresh = { ...GROUP, id: 'group-fresh', name: 'Fresh' };
    clientStore.select({ kind: 'channel', channelId: fresh.id });
    clientStore.setConversation({ channel: fresh });
    await actions.refreshRoster();
    expect(clientStore.getSnapshot().selection).toEqual({ kind: 'channel', channelId: fresh.id });
  });

  it('ignores a channel list from a refresh that a newer refresh overtook', async () => {
    const pending: Array<(value: { channels: (typeof GROUP | typeof DM)[] }) => void> = [];
    let deferred = false;
    const { clientStore, actions } = setup({
      channels: () =>
        deferred ? new Promise((resolve) => pending.push(resolve)) : { channels: [GROUP, DM] },
    });
    await actions.load();
    clientStore.select({ kind: 'channel', channelId: GROUP.id });
    clientStore.setConversation({ channel: GROUP });
    deferred = true;
    const stale = actions.refreshRoster();
    const fresh = actions.refreshRoster();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!({ channels: [GROUP, DM] });
    await fresh;
    pending[0]!({ channels: [DM] });
    await stale;
    expect(clientStore.getSnapshot().selection).toEqual({ kind: 'channel', channelId: GROUP.id });
    expect(clientStore.getSnapshot().channels.map((channel) => channel.id)).toEqual([
      GROUP.id,
      DM.id,
    ]);
  });

  it('mirrors the host arrangement into the roster state', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: ['ada'],
        sections: [
          { id: 's2', name: '研究', channelIds: [] },
          { id: 's1', name: '工作流', channelIds: ['c1'] },
        ],
      }),
    });

    await actions.load();

    expect(clientStore.getSnapshot().roster).toEqual({
      pins: ['ada'],
      hidden: [],
      muted: [],
      sections: [
        { id: 's2', name: '研究', channelIds: [] },
        { id: 's1', name: '工作流', channelIds: ['c1'] },
      ],
      topOrder: undefined,
      readOnly: false,
    });
  });

  it('creates a section through the bridge and refreshes the roster', async () => {
    const writes: unknown[] = [];
    let sections: Array<{ id: string; name: string; channelIds: string[] }> = [];
    const { clientStore, actions } = setup({
      sectionCreate: (payload) => {
        writes.push(payload);
        const created = { id: 'host-1', name: String(payload['name']), channelIds: [] };
        sections = [...sections, created];
        return { section: created };
      },
      rosterGet: () => ({ pins: [], sections }),
    });

    const created = await actions.createSection('研究');

    expect(writes).toEqual([{ name: '研究' }]);
    expect(created).toEqual({ id: 'host-1', name: '研究', channelIds: [] });
    expect(clientStore.getSnapshot().roster.sections).toEqual([
      { id: 'host-1', name: '研究', channelIds: [] },
    ]);
  });

  it('freezes a section order through positioned channelAssign writes', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds = ['c1', 'c2', 'c3'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
        return {};
      },
    });
    await actions.load();

    const applied = await actions.setSectionChannelOrder('s1', ['c3', 'c1', 'c2']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([
      { channelId: 'c3', sectionId: 's1', index: 0 },
      { channelId: 'c1', sectionId: 's1', index: 1 },
      { channelId: 'c2', sectionId: 's1', index: 2 },
    ]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c3', 'c1', 'c2']);
  });

  it('moves a channel into a section through positioned channelAssign writes', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds = ['c1', 'c2'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
        return {};
      },
    });
    await actions.load();

    const applied = await actions.moveChannel('c3', 's1', ['c1', 'c3', 'c2']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([
      { channelId: 'c1', sectionId: 's1', index: 0 },
      { channelId: 'c3', sectionId: 's1', index: 1 },
      { channelId: 'c2', sectionId: 's1', index: 2 },
    ]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c1', 'c3', 'c2']);
  });

  it('moves a channel into an empty section with a single index-0 write', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds: string[] = [];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's-empty', name: 'Empty', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
        return {};
      },
    });
    await actions.load();

    const applied = await actions.moveChannel('c1', 's-empty', ['c1']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([{ channelId: 'c1', sectionId: 's-empty', index: 0 }]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c1']);
  });

  it('persists the section display order through the bridge', async () => {
    const writes: unknown[] = [];
    let sectionOrder = ['s1', 's2'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: sectionOrder.map((id) => ({ id, name: id, channelIds: [] })),
      }),
      sectionReorder: (payload) => {
        writes.push(payload);
        sectionOrder = payload['order'] as string[];
        return { sectionOrder };
      },
    });
    await actions.load();

    const applied = await actions.reorderSections(['s2', 's1']);

    expect(applied).toBe(true);
    expect(writes).toEqual([{ order: ['s2', 's1'] }]);
    expect(clientStore.getSnapshot().roster.sections.map((section) => section.id)).toEqual([
      's2',
      's1',
    ]);
  });

  it('persists absolute flat orders and moves channels into flat slots', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let topOrder: unknown[] = [{ kind: 'section', id: 's1' }];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: ['c1'] }],
        topOrder,
      }),
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        return {};
      },
      topReorder: (payload) => {
        calls.push({ endpoint: 'topReorder', payload });
        topOrder = payload['order'] as unknown[];
        return { topOrder };
      },
    });
    await actions.load();

    await actions.reorderFlat([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);
    await actions.moveToFlat('c1', [
      { kind: 'channel', id: 'c1' },
      { kind: 'section', id: 's1' },
    ]);

    expect(calls.map((call) => call.endpoint)).toEqual([
      'topReorder',
      'channelAssign',
      'topReorder',
    ]);
    expect(calls[1]).toEqual({
      endpoint: 'channelAssign',
      payload: { channelId: 'c1', sectionId: undefined },
    });
    expect(clientStore.getSnapshot().roster.topOrder).toEqual([
      { kind: 'channel', id: 'c1' },
      { kind: 'section', id: 's1' },
    ]);
  });

  it('converts a pre-flat host arrangement once and then stays quiet', async () => {
    let topOrder: unknown[] | undefined;
    let writes = 0;
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: ['c1'] }],
        ...(topOrder === undefined ? {} : { topOrder }),
      }),
      topReorder: (payload) => {
        writes += 1;
        topOrder = payload['order'] as unknown[];
        return { topOrder };
      },
    });
    await actions.load();
    clientStore.setRoster(
      [],
      [
        { ...GROUP, id: 'c1' },
        { ...GROUP, id: 'loose' },
      ],
    );

    expect(await actions.ensureFlatTopOrder()).toBe(true);
    expect(writes).toBe(1);
    expect(topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
    ]);

    expect(await actions.ensureFlatTopOrder()).toBe(true);
    expect(writes).toBe(1);
  });

  it('projects a valid flat order and deduplicates repeated entries', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: [] }],
        topOrder: [
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'c1' },
          { kind: 'channel', id: 'c1' },
        ],
      }),
    });
    await actions.load();

    expect(clientStore.getSnapshot().roster.topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'c1' },
    ]);
  });

  it('leaves legacy hosts without a flat order for the migration', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins: [], sections: [] }),
    });
    await actions.load();

    expect(clientStore.getSnapshot().roster.topOrder).toBeUndefined();
  });

  it('marks the roster read-only when a write reports storage-unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clientStore = createStore();
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'rosterGet') {
        return { ok: true, value: { pins: [], sections: [], hidden: [], sectionOrder: [] } };
      }
      if (endpoint === 'sectionCreate') {
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'roster storage is unavailable',
            details: {},
          },
        };
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    };
    const actions = createActions(call, clientStore);
    await actions.load();

    await expect(actions.createSection('A')).resolves.toBeUndefined();
    expect(clientStore.getSnapshot().roster.readOnly).toBe(true);
    warn.mockRestore();
  });

  it('marks the roster read-only on the first load and clears it when a later load succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clientStore = createStore();
    let unavailable = true;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'list') return { ok: true, value: { bots: [] } };
      if (endpoint === 'channels') return { ok: true, value: { channels: [] } };
      if (endpoint === 'rosterGet') {
        return unavailable
          ? {
              ok: false,
              error: {
                code: 'storage-unavailable',
                message: 'roster storage is unavailable',
                details: {},
              },
            }
          : { ok: true, value: { pins: ['ada'], sections: [], hidden: [], sectionOrder: [] } };
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    };
    const actions = createActions(call, clientStore);

    await actions.load();
    expect(clientStore.getSnapshot().roster.readOnly).toBe(true);
    expect(clientStore.getSnapshot().status).toBe('ready');

    unavailable = false;
    await actions.refreshRoster();
    expect(clientStore.getSnapshot().roster).toEqual({
      pins: ['ada'],
      hidden: [],
      muted: [],
      sections: [],
      topOrder: undefined,
      readOnly: false,
    });
    warn.mockRestore();
  });
});
