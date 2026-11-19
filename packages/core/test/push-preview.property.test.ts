import fc from 'fast-check';
import { expect, it } from 'vitest';

import { activityListPushSource, type PushApprovalLookup } from '../src/push/source.js';
import type { HumanAttentionItem } from '../src/runtime/human-attention.js';

const generatedText = fc
  .tuple(
    fc.array(fc.constantFrom('a', '中', '🙂', ' ', '\n', '\t', '\u00a0'), { maxLength: 220 }),
    fc.constantFrom(0, 1, 138, 139, 140, 141, 142),
  )
  .map(([parts, length]) => 'x'.repeat(length) + parts.join(''));

function project(
  kind: 'user-question' | 'private-input' | 'tool-approval',
  summary: string,
  options?: { masked?: boolean; approval?: PushApprovalLookup },
) {
  const item: HumanAttentionItem = {
    id: 'request-1',
    category: 'action',
    kind,
    botSlug: 'ada',
    channelId: 'dm-ada',
    messageId: 'message-1',
    createdAt: '2026-11-05T00:00:00.000Z',
    summary,
    ...(options?.masked
      ? {
          approval: {
            masked: true,
            kind,
            botSlug: 'ada',
            requestedAt: '2026-11-05T00:00:00.000Z',
            state: 'pending',
          },
        }
      : {}),
  };
  const { items } = activityListPushSource(
    {
      list: (_human, query) => ({ items: query?.category === 'action' ? [item] : [] }),
      actionCount: () => 1,
      dmReplies: () => [],
    },
    () => 'Ada',
    options?.approval,
  ).pending();
  expect(items).toHaveLength(1);
  return items[0];
}

it('projects only normalized previews of at most 140 UTF-16 code units', () => {
  fc.assert(
    fc.property(generatedText, (summary) => {
      const words = summary.match(/\S+/gu) ?? [];
      const normalized = words.join(' ');
      const expected =
        normalized.length > 140
          ? `${normalized.split('').splice(0, 139).join('').replace(/ +$/u, '')}…`
          : normalized || undefined;
      expect(project('user-question', summary)?.preview).toBe(expected);
    }),
    {
      examples: [
        [''],
        ['  alpha\t\n beta\u00a0gamma  '],
        ['x'.repeat(140)],
        ['x'.repeat(138) + ' xyz'],
        ['x'.repeat(138) + '🙂!'],
      ],
    },
  );
});

it('keeps private input and masked approvals out of notification previews', () => {
  fc.assert(
    fc.property(generatedText, (content) => {
      const summary = `private summary ${content}`;
      const privateInput = project('private-input', summary);
      expect(privateInput?.kind).toBe('private-input');
      expect(privateInput).not.toHaveProperty('preview');

      const maskedApproval = project('tool-approval', summary, {
        masked: true,
        approval: () => ({ toolName: 'bash', input: content, allowAlways: true }),
      });
      expect(maskedApproval?.approval?.masked).toBe(true);
      expect(maskedApproval).not.toHaveProperty('preview');
      expect(maskedApproval).not.toHaveProperty('categoryId');
    }),
  );
});
