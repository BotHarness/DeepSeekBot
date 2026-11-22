// @vitest-environment jsdom
import { type ExternalSource } from '../../core/src/messaging/inbound.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { ExternalSourceContent } from '../src/client/external-source-content.js';
import { zhTranslate } from '../src/client/locale.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = document.createElement('div');
document.body.append(host);
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
});
const source: ExternalSource = {
  id: 'im-quote',
  body: 'follow up',
  at: '2026-10-07T00:00:00.000Z',
  platform: 'weixin',
  accountName: 'QA Bot',
  conversationName: 'Paired owner',
  grantId: 'grant',
  grantRevision: 1,
  event: {
    version: 1,
    channel: 'weixin',
    botId: 'wx',
    fingerprint: 'a'.repeat(64),
    eventId: 'native',
    messageId: '9007199254740995',
    actor: { kind: 'user', id: 'owner' },
    conversation: { kind: 'dm', id: 'owner' },
    mentions: [],
    mentionedAccount: false,
    at: '2026-10-07T00:00:00.000Z',
    quote: { serverMessageId: '9007199254740993', summary: 'display summary' },
    reply: { messageId: '9007199254740995', conversationId: 'owner', actorId: 'owner' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  },
};
it('separates resolved quote provenance from the actual reply and keeps lossless native IDs in details', async () => {
  await act(async () =>
    root.render(
      createElement(ExternalSourceContent, {
        source: {
          ...source,
          quote: { kind: 'retained', text: 'actual original', sourceEventId: 'im-original' },
        },
        t: zhTranslate,
      }),
    ),
  );
  expect(host.querySelector('.bh-external-quote')?.textContent).toContain('actual original');
  expect(host.querySelector('.bh-external-quote')?.textContent).toContain(
    zhTranslate('im.quoteRetained'),
  );
  expect(host.querySelector('.bh-external-quote')?.textContent).toContain('9007199254740993');
  expect(host.querySelector('.bh-external-message-text')?.textContent).toBe('follow up');
  expect(host.querySelector('.bh-external-scope')?.textContent).toBe(zhTranslate('im.dmLabel'));
});
it('labels an unretained quote and local coverage without promoting the title or inventing a Thread', async () => {
  await act(async () =>
    root.render(
      createElement(ExternalSourceContent, {
        source: {
          ...source,
          quote: { kind: 'unavailable', reason: 'not-retained-or-inaccessible' },
          contextReads: [
            {
              at: source.at,
              sessionId: 'session',
              scope: 'retained',
              coverage: 'retained-local-sources',
              outcome: 'read',
              sourceEventIds: [],
              omitted: 0,
              incomplete: false,
            },
          ],
        },
        t: zhTranslate,
      }),
    ),
  );
  expect(host.textContent).toContain(zhTranslate('im.quoteUnavailableHint'));
  expect(host.textContent).toContain(zhTranslate('im.contextRetainedExplanation'));
  expect(host.querySelector('.bh-external-quote')?.textContent).toContain('display summary');
  expect(host.querySelector('.bh-external-quote')?.textContent).not.toContain('actual original');
});

it('shows the latest page status and the WeChat sender label while retaining earlier pagination evidence', async () => {
  const read = {
    at: source.at,
    sessionId: 'session',
    scope: 'retained' as const,
    coverage: 'retained-local-sources' as const,
    outcome: 'read' as const,
    sourceEventIds: ['im-original'],
    omitted: 0,
  };
  await act(async () =>
    root.render(
      createElement(ExternalSourceContent, {
        source: {
          ...source,
          contextReads: [
            { ...read, incomplete: true },
            { ...read, incomplete: false },
          ],
          contextMessages: [
            {
              sourceEventId: 'im-original',
              messageId: 'native-original',
              senderId: 'private-native-user-id',
              at: source.at,
              text: 'original body',
            },
          ],
        },
        t: zhTranslate,
      }),
    ),
  );
  expect(host.querySelector('.bh-external-context > .bh-external-notice')).toBeNull();
  expect(host.querySelector('.bh-external-audit')?.textContent).toContain(
    zhTranslate('im.contextIncomplete', { count: '0' }),
  );
  expect(host.querySelector('.bh-external-context-messages strong')?.textContent).toBe(
    zhTranslate('im.weixinUser'),
  );
  expect(
    host.querySelector('.bh-external-context-messages .bh-external-detail-body')?.textContent,
  ).toContain('private-native-user-id');
});
