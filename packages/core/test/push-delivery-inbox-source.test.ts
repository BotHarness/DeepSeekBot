import { describe, expect, it, vi } from 'vitest';
import { activityListPushSource } from '../src/push/source.js';
import type { HumanAttentionItem } from '../src/runtime/human-attention.js';
import { SECRET_TEXT } from './push-delivery-fixtures.js';

describe('Human Inbox push source', () => {
  it('projects approvals, questions, private input and unread replies with a short preview', () => {
    const item = (over: Partial<HumanAttentionItem>): HumanAttentionItem => ({
      id: 'x',
      category: 'action',
      kind: 'tool-approval',
      createdAt: '2026-10-14T08:00:00.000Z',
      botSlug: 'ada',
      summary: '请求批准执行 bash',
      ...over,
    });
    const source = activityListPushSource(
      {
        list: (human, { category }) => ({
          items:
            category === 'action'
              ? [
                  item({
                    id: 'approval:1',
                    channelId: 'dm-ada',
                    channelName: 'Ada',
                    messageId: 'm',
                  }),
                  item({ id: 'approval:2', channelId: 'g1', channelName: 'ops', messageId: 'n' }),
                  item({ id: 'join:1', kind: 'group-join-request' }),
                  item({ id: 'secret:1', kind: 'private-input', summary: SECRET_TEXT }),
                  item({ id: 'question:1', kind: 'user-question', summary: 'Which\n  branch?' }),
                ]
              : [
                  item({
                    id: 'reply:1',
                    category: 'replies',
                    kind: 'channel-mention',
                    summary: 'x'.repeat(300),
                  }),
                  item({
                    id: 'reply:2',
                    category: 'replies',
                    kind: 'channel-reply',
                    isUnread: false,
                  }),
                ],
        }),
        actionCount: () => 3,
        dmReplies: () => [
          item({
            id: 'dm-reply:1',
            category: 'replies',
            kind: 'channel-reply',
            channelId: 'dm-ada',
            summary: 'Done',
            isUnread: true,
          }),
        ],
      },
      () => 'Ada',
      (_, messageId) =>
        messageId === 'm'
          ? {
              toolName: 'bash',
              input: JSON.stringify({ description: 'x', command: 'date > now' }),
              allowAlways: true,
            }
          : { toolName: 'secret_cli', input: '{}', allowAlways: true },
    );
    const pending = source.pending();
    expect(pending.badge).toBe(3);
    expect(
      pending.items.map((entry) => [
        entry.id,
        entry.kind,
        entry.channelName,
        entry.preview,
        entry.categoryId,
      ]),
    ).toEqual([
      ['approval:1', 'approval', undefined, 'bash · date > now', 'tool-approval'],
      ['approval:2', 'approval', 'ops', 'secret_cli', 'tool-approval'],
      ['join:1', 'approval', undefined, '请求批准执行 bash', undefined],
      ['secret:1', 'private-input', undefined, undefined, undefined],
      ['question:1', 'question', undefined, 'Which branch?', undefined],
      ['reply:1', 'reply', undefined, `${'x'.repeat(139)}…`, undefined],
      ['dm-reply:1', 'reply', undefined, 'Done', undefined],
    ]);
    expect(JSON.stringify(pending)).not.toContain(SECRET_TEXT);
  });

  it('reads only unread replies, deep enough that a long unread backlog is not resolved by mistake', () => {
    const queries: unknown[] = [];
    const dmLimits: number[] = [];
    activityListPushSource(
      {
        list: (human, query) => {
          queries.push(query);
          return { items: [] };
        },
        actionCount: () => 0,
        dmReplies: (human, limit) => {
          dmLimits.push(limit);
          return [];
        },
      },
      () => undefined,
    ).pending();
    expect(queries[1]).toEqual({ category: 'replies', unreadOnly: true, limit: 100 });
    expect(dmLimits).toEqual([200]);
  });

  it('pages through a backlog of more than 100 unread replies without exceeding the query limit', () => {
    const backlog = Array.from(
      { length: 250 },
      (_, index) =>
        ({
          id: `reply:${String(index)}`,
          category: 'replies',
          kind: 'channel-reply',
          channelId: 'dm-ada',
          channelName: 'Ada',
          botSlug: 'ada',
          summary: `reply ${String(index)}`,
          messageId: `m${String(index)}`,
          createdAt: '2026-11-10T00:00:00.000Z',
          isUnread: true,
        }) as HumanAttentionItem,
    );
    const limits: number[] = [];
    const pending = activityListPushSource(
      {
        list: (human, { category, limit = 30, cursor }) => {
          if (limit < 1 || limit > 100) throw new Error('Human attention limit must be 1-100');
          if (category !== 'replies') return { items: [] };
          limits.push(limit);
          const start = cursor === undefined ? 0 : Number(cursor);
          const end = start + limit;
          return {
            items: backlog.slice(start, end),
            ...(end < backlog.length ? { nextCursor: String(end) } : {}),
          };
        },
        actionCount: () => 0,
        dmReplies: () => [],
      },
      () => 'Ada',
    ).pending();
    expect(limits).toEqual([100, 100]);
    expect(pending.items).toHaveLength(200);
  });

  it('offers Always allow from the notification only when the Host offers it', () => {
    const source = activityListPushSource(
      {
        list: (human, { category }) => ({
          items:
            category === 'action'
              ? [
                  {
                    id: 'approval:human-only',
                    category: 'action',
                    kind: 'tool-approval',
                    createdAt: '2026-10-14T08:00:00.000Z',
                    botSlug: 'ada',
                    summary: '请求批准执行 bash',
                    channelId: 'dm-ada',
                    messageId: 'm',
                  },
                ]
              : [],
        }),
        actionCount: () => 1,
        dmReplies: () => [],
      },
      () => 'Ada',
      () => ({ toolName: 'bash', input: '{"command":"deepseekbot grant-write-set"}' }),
    );
    expect(source.pending().items.map((entry) => entry.categoryId)).toEqual(['tool-approval-once']);
  });

  it('notifies a folder request as an approval that opens the app, with its reason', () => {
    const lookup = vi.fn(() => ({ toolName: 'bash', input: '{}', allowAlways: true }));
    const source = activityListPushSource(
      {
        list: (human, { category }) => ({
          items:
            category === 'action'
              ? [
                  {
                    id: 'grant:e1',
                    category: 'action',
                    kind: 'workspace-grant-request',
                    createdAt: '2026-10-14T08:00:00.000Z',
                    botSlug: 'ada',
                    summary: 'I need to write the report into your project folder.',
                    channelId: 'dm-ada',
                    messageId: 'g1',
                  },
                ]
              : [],
        }),
        actionCount: () => 1,
        dmReplies: () => [],
      },
      () => 'Ada',
      lookup,
    );
    expect(source.pending().items).toEqual([
      {
        id: 'grant:e1',
        kind: 'approval',
        attentionKind: 'workspace-grant-request',
        botSlug: 'ada',
        createdAt: '2026-10-14T08:00:00.000Z',
        channelId: 'dm-ada',
        messageId: 'g1',
        preview: 'I need to write the report into your project folder.',
      },
    ]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('notifies auto-rejections and join requests as approvals and Assignment asks as questions', () => {
    const item = (id: string, kind: string, summary: string) => ({
      id,
      category: 'action' as const,
      kind: kind as 'tool-approval',
      createdAt: '2026-10-14T08:00:00.000Z',
      botSlug: 'ada',
      summary,
      channelId: 'dm-ada',
    });
    const source = activityListPushSource(
      {
        list: (human, { category }) => ({
          items:
            category === 'action'
              ? [
                  item('autoreject:e1', 'auto-rejection', 'Rejected by the template'),
                  item('join:r1', 'group-join-request', ''),
                  item('assignment:s1', 'assignment-waiting-human', 'Which region?'),
                  item('assignment:s2', 'assignment-blocked', 'Build is failing'),
                  item('repair:e2:ada', 'bot-message-needs-repair', 'Check this'),
                ]
              : [],
        }),
        actionCount: () => 5,
        dmReplies: () => [],
      },
      () => 'Ada',
    );
    expect(
      source
        .pending()
        .items.map((entry) => [entry.id, entry.kind, entry.preview, entry.categoryId]),
    ).toEqual([
      ['autoreject:e1', 'approval', 'Rejected by the template', undefined],
      ['join:r1', 'approval', undefined, undefined],
      ['assignment:s1', 'question', 'Which region?', undefined],
      ['assignment:s2', 'question', 'Build is failing', undefined],
    ]);
  });
});
