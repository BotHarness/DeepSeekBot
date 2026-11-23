import { createActions } from '../src/client/actions.js';
import { type BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

type Handler = (payload: Record<string, unknown>) => unknown;

function bridgeCall(handlers: Record<string, Handler>): BridgeCall {
  return async (endpoint, payload) => {
    const handler = handlers[endpoint];
    if (handler === undefined) throw new Error(`unexpected endpoint: ${endpoint}`);
    const value = await handler(payload);
    if (endpoint === 'rosterGet')
      return { ok: true, value: { hidden: [], sectionOrder: [], ...Object(value) } };
    return { ok: true, value };
  };
}

const BOT = {
  slug: 'ada',
  displayName: 'Ada',
  roles: ['研究'],
  aggregateState: 'working',
  workspaces: ['/srv/ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
};

const GROUP = {
  id: 'group-team',
  type: 'group' as const,
  name: 'Team',
  members: ['ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

const DM = {
  id: 'dm-ada',
  type: 'dm' as const,
  name: 'Ada',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

export { bridgeCall, BOT, GROUP, DM };

export function setup(extra: Record<string, Handler> = {}) {
  const clientStore = createStore();
  let topOrder: Array<{ kind: 'section' | 'channel'; id: string }> = [];
  let pins: string[] = [];
  const call = bridgeCall({
    list: () => ({ bots: [BOT] }),
    channels: () => ({ channels: [GROUP, DM] }),
    channelDm: () => ({ channel: DM }),
    channelMessages: () => ({
      revision: 2,
      messages: [
        { id: 'm2', at: '2026-09-19T00:02:00.000Z', author: { kind: 'human' }, body: 'newer' },
        { id: 'm1', at: '2026-09-19T00:01:00.000Z', author: { kind: 'human' }, body: 'older' },
      ],
    }),
    channelReadPosition: () => ({}),
    channelMarkRead: () => ({
      position: { messageId: 'm2', revision: 2, readAt: BOT.createdAt },
    }),
    channelTimeline: () => ({
      revision: 2,
      page: {
        entries: [
          { id: 'm1', at: '2026-09-19T00:01:00.000Z', author: { kind: 'human' }, body: 'older' },
          { id: 'm2', at: '2026-09-19T00:02:00.000Z', author: { kind: 'human' }, body: 'newer' },
        ],
        olderCursor: 'm1',
        newerCursor: 'm2',
        hasOlder: false,
        hasNewer: false,
      },
    }),
    channelSend: (payload) => ({
      message: {
        id: 'm3',
        at: '2026-09-19T00:03:00.000Z',
        author: { kind: 'human' },
        body: payload['body'],
      },
    }),
    channelCreate: (payload) => ({
      channel: { ...GROUP, name: payload['name'], members: [] },
    }),
    channelRename: (payload) => ({
      channel: { ...DM, name: payload['name'] },
      bot: { ...BOT, displayName: payload['name'] },
    }),
    sessions: () => ({
      sessions: [
        { sessionId: 'orchestrator-1', role: 'orchestrator', createdAt: BOT.createdAt },
        {
          sessionId: 'assignment-1',
          role: 'assignment',
          createdAt: BOT.createdAt,
          cwdReference: '/srv/ada',
          assignmentActivity: 'idle',
        },
      ],
    }),
    rosterGet: () => ({ pins, sections: [], topOrder }),
    pinsSet: (payload) => {
      pins = payload['pins'] as string[];
      return { pins };
    },
    channelAssign: () => ({}),
    topReorder: (payload) => {
      topOrder = payload['order'] as typeof topOrder;
      return { topOrder };
    },
    ...extra,
  });
  return { clientStore, actions: createActions(call, clientStore) };
}
