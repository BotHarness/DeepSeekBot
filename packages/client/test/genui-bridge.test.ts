import { describe, expect, it, vi } from 'vitest';
import { initialGenuiView, type GenuiReply } from '../../core/src/channels/genui.js';
import { createActions } from '../src/client/actions.js';
import {
  BridgeCallError,
  loadGenuiView,
  parseGenuiView,
  saveGenuiView,
  type BridgeCall,
} from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

const channel = {
  id: 'dm-ada',
  type: 'dm' as const,
  name: 'Ada',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: '2026-11-07T00:00:00Z',
  updatedAt: '2026-11-07T00:00:00Z',
};
const reply: GenuiReply = {
  messageId: 'report-1',
  snapshotId: 'snapshot-1',
  selectedIds: ['alpha'],
  intent: 'continue',
};

describe('GenUI client bridge', () => {
  it('loads and saves only the Host-owned view using the exact snapshot and CAS version', async () => {
    const state = initialGenuiView();
    const call = vi.fn<BridgeCall>(async () => ({ ok: true, value: { version: 2, state } }));
    await expect(loadGenuiView(call, 'dm-ada', 'report-1')).resolves.toEqual({ version: 2, state });
    expect(call).toHaveBeenLastCalledWith(
      'channelGenuiView',
      { channelId: 'dm-ada', messageId: 'report-1' },
      undefined,
    );
    await saveGenuiView(call, 'dm-ada', 'report-1', 'snapshot-1', 1, state);
    expect(call).toHaveBeenLastCalledWith(
      'channelGenuiViewSave',
      {
        channelId: 'dm-ada',
        messageId: 'report-1',
        snapshotId: 'snapshot-1',
        expectedVersion: 1,
        state,
      },
      undefined,
    );
  });

  it.each([-1, 0.5, Infinity, '1', undefined])(
    'rejects malformed private view versions: %s',
    (version) => {
      expect(() => parseGenuiView({ version, state: initialGenuiView() })).toThrow();
    },
  );

  it('keeps the conflict code for explicit draft recovery', async () => {
    const call: BridgeCall = async () => ({
      ok: false,
      error: { code: 'genui-view-conflict', message: 'Conflict', details: {} },
    });
    await expect(
      saveGenuiView(call, 'dm-ada', 'report-1', 'snapshot-1', 0, initialGenuiView()),
    ).rejects.toMatchObject({ code: 'genui-view-conflict' });
  });

  it('sends ordinary channelSend metadata and refreshes the ordinary timeline', async () => {
    const clientStore = createStore();
    clientStore.setConversation({ status: 'ready', channel, messages: [], revision: 0 });
    const call = vi.fn<BridgeCall>(async (endpoint, payload) => {
      if (endpoint === 'channelSend')
        return {
          ok: true,
          value: {
            message: {
              id: payload['messageId'],
              at: channel.createdAt,
              body: payload['body'],
              author: { kind: 'human' },
              genuiReply: payload['genuiReply'],
            },
          },
        };
      if (endpoint === 'channelTimeline')
        return {
          ok: true,
          value: {
            revision: 1,
            page: {
              entries: [],
              olderCursor: null,
              newerCursor: null,
              hasOlder: false,
              hasNewer: false,
            },
          },
        };
      throw new Error(`Unexpected call: ${endpoint}`);
    });
    const actions = createActions(call, clientStore);
    await actions.sendGenuiReply(channel.id, 'Continue with Alpha', 'client-uuid', reply);
    expect(call).toHaveBeenNthCalledWith(
      1,
      'channelSend',
      {
        channelId: channel.id,
        body: 'Continue with Alpha',
        messageId: 'client-uuid',
        genuiReply: reply,
      },
      undefined,
    );
    expect(call).toHaveBeenNthCalledWith(
      2,
      'channelTimeline',
      { channelId: channel.id },
      undefined,
    );
    expect(vi.mocked(call).mock.calls[0]?.[1]).not.toHaveProperty('assignmentReply');
    expect(vi.mocked(call).mock.calls[0]?.[1]).not.toHaveProperty('sessionId');
  });

  it('refuses a stale channel send before making any Host call', async () => {
    const clientStore = createStore();
    clientStore.setConversation({
      status: 'ready',
      channel: { ...channel, id: 'dm-other' },
      messages: [],
      revision: 0,
    });
    const call: BridgeCall = vi.fn(async () => {
      throw new Error('Must not call');
    });
    await expect(
      createActions(call, clientStore).sendGenuiReply(channel.id, 'Continue', 'uuid', reply),
    ).rejects.toThrow('genui-unavailable');
    expect(call).not.toHaveBeenCalled();
  });

  it('does not bypass a send refusal by refreshing or making a callback', async () => {
    const clientStore = createStore();
    clientStore.setConversation({ status: 'ready', channel, messages: [], revision: 0 });
    const call = vi.fn<BridgeCall>(async () => ({
      ok: false,
      error: { code: 'genui-unavailable', message: 'Refused', details: {} },
    }));
    await expect(
      createActions(call, clientStore).sendGenuiReply(channel.id, 'Continue', 'uuid', reply),
    ).rejects.toBeInstanceOf(BridgeCallError);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
