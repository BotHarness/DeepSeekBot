import { expect, it } from 'vitest';
import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore, type HumanAttentionItem } from '../src/client/store.js';

const item = (slug: string, minute: string): HumanAttentionItem => ({
  id: 'approval:' + slug,
  kind: 'tool-approval',
  category: 'action',
  createdAt: '2026-10-01T08:' + minute + ':00Z',
  channelId: 'dm-' + slug,
  channelName: 'channel-' + slug,
  botSlug: slug,
  messageId: 'request-' + slug,
  summary: 'Approve bash',
});

it('opens a fresh Human Inbox with oldest action order', async () => {
  const client = createStore();
  const requests: Record<string, unknown>[] = [];
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'humanAttention') {
      requests.push(payload);
      return { ok: true, value: { items: [] } };
    }
    return { ok: true, value: { unreadCount: 0, hasAction: false } };
  };
  await createActions(call, client).openHumanInbox();
  expect(requests).toMatchObject([{ category: 'action', sort: 'oldest' }]);
});

it('removes a confirmed decision from retained older pages', async () => {
  const client = createStore();
  const older = Array.from({ length: 51 }, (_, index) => item('bot' + index, '01'));
  const target = older[50]!;
  client.select({ kind: 'inbox' });
  client.setHumanInbox({
    category: 'action',
    status: 'ready',
    items: older,
    nextCursor: 'older-page',
  });
  const call: BridgeCall = async (endpoint) => {
    if (endpoint === 'toolApprovalDecide') return { ok: true, value: { accepted: true } };
    if (endpoint === 'humanAttention')
      return { ok: true, value: { items: older.slice(0, 50), nextCursor: 'new-head' } };
    return { ok: true, value: { unreadCount: 0, hasAction: true } };
  };
  await createActions(call, client).decideToolApproval(
    target.channelId!,
    target.messageId!,
    'allowed-once',
  );
  expect(client.getSnapshot().humanInbox.items.map((i) => i.id)).toEqual(
    older.slice(0, 50).map((i) => i.id),
  );
});
