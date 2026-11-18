// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { ExternalSource } from '../../core/src/messaging/inbound.js';
import { ExternalSourceContent } from '../src/client/external-source-content.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
}));
const enTranslate: BotHarnessTranslate = (key, params) => {
  const english: Readonly<Record<string, string>> = en;
  let text: string = english[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replaceAll('{' + name + '}', String(value));
  return text;
};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = document.createElement('div');
document.body.append(host);
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
});
function source(transcript: 'platform' | 'unavailable'): ExternalSource {
  return {
    id: 'im-voice',
    body:
      transcript === 'platform'
        ? 'BH905 今天预约三点会议'
        : '[WeChat voice message: platform did not provide a transcript]',
    at: '2026-10-06T07:00:00.000Z',
    platform: 'weixin',
    accountName: 'WeChat QA',
    conversationName: 'Paired owner',
    grantId: 'grant',
    grantRevision: 1,
    event: {
      version: 1,
      channel: 'weixin',
      botId: 'wx-qa',
      fingerprint: 'a'.repeat(64),
      eventId: 'native',
      messageId: '9007199254740993',
      actor: { kind: 'user', id: 'owner' },
      conversation: { kind: 'dm', id: 'owner' },
      mentions: [],
      mentionedAccount: false,
      at: '2026-10-06T07:00:00.000Z',
      voice: { transcript, itemId: 'voice-native-item', durationMs: 2500 },
      reply: { messageId: '9007199254740993', conversationId: 'owner', actorId: 'owner' },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    },
  };
}
it.each([zhTranslate, enTranslate])(
  'shows platform transcript provenance and duration without inventing audio playback',
  async (t) => {
    await act(async () =>
      root.render(createElement(ExternalSourceContent, { source: source('platform'), t })),
    );
    expect(host.textContent).toContain(t('im.voiceTranscriptPlatform'));
    expect(host.textContent).toContain(t('im.voiceDuration', { seconds: '2.5' }));
    expect(host.querySelector('.bh-external-message-text')?.textContent).toBe(
      'BH905 今天预约三点会议',
    );
    expect(host.textContent).toContain('9007199254740993');
    expect(host.textContent).toContain('voice-native-item');
    expect(host.querySelector('audio, video, img, a[download]')).toBeNull();
  },
);
it('clearly shows absent platform transcription rather than an English placeholder or fabricated transcript', async () => {
  await act(async () =>
    root.render(
      createElement(ExternalSourceContent, { source: source('unavailable'), t: zhTranslate }),
    ),
  );
  expect(host.textContent).toContain(zhTranslate('im.voiceTranscriptUnavailable'));
  expect(host.querySelector('.bh-external-message-text')?.textContent).toBe(
    zhTranslate('im.voiceTranscriptUnavailableHint'),
  );
  expect(host.textContent).not.toContain('[WeChat voice message:');
  expect(host.querySelector('audio, video, img')).toBeNull();
});
