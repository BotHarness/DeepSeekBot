import { describe, expect, it, vi } from 'vitest';
import { humanContext, OWNER_HUMAN_CONTEXT, type HumanContext } from '../src/humans/context.js';
import {
  withNativeSessionAttention,
  type NativeSessionAttentionEntry,
} from '../src/features/activity/native-session-attention.js';
import type { HumanAttentionItem, HumanAttentionQuery } from '../src/runtime/human-attention.js';

const botItem = (id: string, createdAt: string): HumanAttentionItem => ({
  id,
  category: 'action',
  kind: 'tool-approval',
  createdAt,
  botSlug: 'ada',
  summary: 'Ada wants to run bash',
  channelId: 'dm-ada',
  channelName: 'Ada',
  messageId: id,
});

const entry = (over: Partial<NativeSessionAttentionEntry> = {}): NativeSessionAttentionEntry => ({
  sessionId: 'native-1',
  requestId: 'event-1',
  input: 'approval',
  summary: 'bash · Deploy the site',
  createdAt: '2026-11-25T10:00:01.000Z',
  sessionTitle: 'Ship the landing page',
  ...over,
});

function setup(options: { enabled?: boolean; entries?: NativeSessionAttentionEntry[] } = {}) {
  const list = vi.fn<HumanAttentionQuery['list']>((_human, input) => ({
    items:
      input.category === undefined || input.category === 'action'
        ? [
            botItem('approval:1', '2026-11-25T10:00:00.000Z'),
            botItem('approval:2', '2026-11-25T10:00:02.000Z'),
          ]
        : [],
    nextCursor: 'next',
  }));
  const status = vi.fn<HumanAttentionQuery['status']>(() => ({ unreadCount: 2, hasAction: false }));
  const base = { list, status } as unknown as HumanAttentionQuery;
  let enabled = options.enabled ?? true;
  const owner = (human: HumanContext) =>
    human.caller !== 'bot' && human.humanId === OWNER_HUMAN_CONTEXT.humanId;
  const query = withNativeSessionAttention(base, {
    source: () => ({ list: () => options.entries ?? [entry()], subscribe: () => () => {} }),
    enabled: () => enabled,
    owner,
  });
  return { query, list, status, setEnabled: (value: boolean) => (enabled = value) };
}

describe('native Session attention in Activity', () => {
  it('keeps Activity Bot-only unless the read asks for native Sessions', () => {
    const { query, list } = setup();
    const page = query.list(OWNER_HUMAN_CONTEXT, { category: 'action' });
    expect(page.items.map((item) => item.id)).toEqual(['approval:1', 'approval:2']);
    expect(list.mock.calls[0]?.[1]).not.toHaveProperty('source');
  });

  it('merges native requests into the first action page in the requested order', () => {
    const { query } = setup();
    const oldest = query.list(OWNER_HUMAN_CONTEXT, { category: 'action', source: 'all' });
    expect(oldest.items.map((item) => item.id)).toEqual([
      'approval:1',
      'native-session:event-1',
      'approval:2',
    ]);
    expect(oldest.nextCursor).toBe('next');
    expect(oldest.items[1]).toEqual({
      id: 'native-session:event-1',
      category: 'action',
      kind: 'native-session-input',
      createdAt: '2026-11-25T10:00:01.000Z',
      botSlug: '',
      summary: 'bash · Deploy the site',
      requestId: 'event-1',
      nativeSession: {
        sessionId: 'native-1',
        input: 'approval',
        sessionTitle: 'Ship the landing page',
      },
    });
    const newest = query.list(OWNER_HUMAN_CONTEXT, { source: 'all', sort: 'newest' });
    expect(newest.items.map((item) => item.id)).toEqual([
      'approval:2',
      'native-session:event-1',
      'approval:1',
    ]);
  });

  it('lists only native requests for the native source and skips the database read', () => {
    const { query, list } = setup();
    expect(
      query.list(OWNER_HUMAN_CONTEXT, { source: 'native' }).items.map((item) => item.id),
    ).toEqual(['native-session:event-1']);
    expect(list).not.toHaveBeenCalled();
  });

  it('shows native requests only to the Host Owner, never to Team members or Bot callers', () => {
    const { query } = setup();
    const member = humanContext('alice');
    const bot = Object.freeze({ ...OWNER_HUMAN_CONTEXT, caller: 'bot' as const });
    for (const human of [member, bot])
      expect(query.list(human, { source: 'all' }).items.some((item) => item.botSlug === '')).toBe(
        false,
      );
  });

  it('drops native requests from Activity while nativeSessionAttention is off', () => {
    const { query, setEnabled } = setup();
    setEnabled(false);
    expect(query.list(OWNER_HUMAN_CONTEXT, { source: 'native' }).items).toEqual([]);
    expect(query.status(OWNER_HUMAN_CONTEXT, false, 'all').hasAction).toBe(false);
    setEnabled(true);
    expect(query.status(OWNER_HUMAN_CONTEXT, false, 'all').hasAction).toBe(true);
    expect(query.status(OWNER_HUMAN_CONTEXT, false).hasAction).toBe(false);
  });

  it('keeps native requests off later pages and out of Bot, Channel and set-aside filters', () => {
    const { query } = setup();
    const native = (input: Parameters<HumanAttentionQuery['list']>[1]) =>
      query
        .list(OWNER_HUMAN_CONTEXT, { source: 'all', ...input })
        .items.filter((item) => item.kind === 'native-session-input');
    expect(native({ cursor: 'page-2' })).toEqual([]);
    expect(native({ botSlug: 'ada' })).toEqual([]);
    expect(native({ channelId: 'dm-ada' })).toEqual([]);
    expect(native({ snoozed: true })).toEqual([]);
    expect(native({ dismissed: true })).toEqual([]);
    expect(native({ category: 'replies' })).toEqual([]);
    expect(native({ search: 'landing' })).toHaveLength(1);
    expect(native({ search: 'nothing like it' })).toEqual([]);
  });
});
