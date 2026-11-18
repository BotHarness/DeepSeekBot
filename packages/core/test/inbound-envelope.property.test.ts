import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseInboundEnvelope, inboundSessionTitle } from '../src/runtime/inbound-envelope.js';

const metadata = 'Source Event ID: source-1\nChannel: dm-ada\nMessage ID: message-1\n';

describe('inbound envelopes', () => {
  it.each([
    ['[Human DM]', 'human-dm'],
    ['[Group]', 'group'],
    ['[Bot DM]', 'bot-dm'],
    ['[Bot Inbox: direct message from PersonaBot ada]', 'bot-dm'],
    ['[Bot Inbox: direct message from PersonaBot ada on Host remote]', 'bot-dm'],
    ['[Bot Inbox: pending DM context]', 'inbox'],
    ['[Bot Inbox: pending Group context]', 'inbox'],
    ['[Bot Inbox: Group digest]', 'inbox'],
  ])('parses %s', (header, kind) => {
    expect(parseInboundEnvelope(`${header}\n${metadata}Hello Ada`)).toEqual({
      kind,
      channelId: 'dm-ada',
      messageId: 'message-1',
      sourceEventId: 'source-1',
      body: 'Hello Ada',
    });
  });

  it('parses the source prefix before a direct Group mention and its Message label', () => {
    expect(
      parseInboundEnvelope(
        'Source Event ID: s\n[Bot Inbox: direct Group mention from Human]\nChannel: c\nMessage ID: m\nMessage: Hello Ada\nReply here',
      ),
    ).toEqual({
      kind: 'inbox',
      sourceEventId: 's',
      channelId: 'c',
      messageId: 'm',
      body: 'Hello Ada\nReply here',
    });
  });

  it.each([
    '',
    '\n[Speaker policies: latest revision wins; Deny wins]\n[{"roleId":"member","revision":1}]',
  ])('parses the trusted speaker suffix and policies: %s', (policies) => {
    const text = `[Human DM]\nSource Event ID: s1 [Human · Member]${policies}\nChannel: c1\nMessage ID: m1\nFix the build`;
    expect(parseInboundEnvelope(text)).toEqual({
      kind: 'human-dm',
      sourceEventId: 's1',
      channelId: 'c1',
      messageId: 'm1',
      body: 'Fix the build',
    });
    expect(inboundSessionTitle(text)).toBe('Fix the build');
    expect(
      parseInboundEnvelope(
        `Source Event ID: s1 [Human]${policies}\n[Bot Inbox: direct Group mention from Human]\nChannel: c1\nMessage ID: m1\nMessage: Fix the build`,
      ),
    ).toEqual({
      kind: 'inbox',
      sourceEventId: 's1',
      channelId: 'c1',
      messageId: 'm1',
      body: 'Fix the build',
    });
  });

  it('handles a named Channel Human before the envelope', () => {
    expect(
      parseInboundEnvelope(
        `Current Channel Human: {"displayName":"Ada"}\n[Human DM]\n${metadata}Hello`,
      )?.body,
    ).toBe('Hello');
  });

  it('parses inline Inbox harvest and metadata-only envelopes', () => {
    expect(parseInboundEnvelope('[Bot Inbox harvest] 2 attention items are ready.')).toEqual({
      kind: 'inbox',
      body: '2 attention items are ready.',
    });
    expect(parseInboundEnvelope(`${metadata}Hello`)).toEqual({
      kind: 'other',
      sourceEventId: 'source-1',
      channelId: 'dm-ada',
      messageId: 'message-1',
      body: 'Hello',
    });
    expect(parseInboundEnvelope('[Bot Inbox: Group invitation]\nJoin us')).toEqual({
      kind: 'inbox',
      body: 'Join us',
    });
  });

  it('preserves trailing Skill and quote context and metadata inside the message body', () => {
    const body =
      'Please help\nChannel: this is message text\n\n[The Human invoked this Skill with /.]\n<skill_invocation name="code">\nInstructions\n</skill_invocation>\n[Quoted messages: the sender cites these earlier messages of this Channel]\n- Message old: "old body"';
    expect(parseInboundEnvelope(`[Human DM]\n${metadata}${body}`)?.body).toBe(body);
    expect(inboundSessionTitle(`[Human DM]\n${metadata}${body}`)).toBe('Please help');
  });

  it.each([
    '',
    'Hello Ada',
    'A line\n[Human DM]\nNot an envelope',
    '[Human DM] is part of a sentence',
    '[Unknown]\nText',
  ])('does not parse ordinary text: %s', (text) => {
    expect(parseInboundEnvelope(text)).toBeUndefined();
  });

  it('keeps a metadata-looking first body line after the envelope metadata', () => {
    expect(parseInboundEnvelope(`[Human DM]\n${metadata}Channel: write about channels`)?.body).toBe(
      'Channel: write about channels',
    );
  });

  it('preserves arbitrary message bodies', () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        const text = `[Human DM]\n${metadata}\n${body}`;
        expect(parseInboundEnvelope(text)?.body).toBe(`\n${body}`);
      }),
    );
  });
});

describe('inbound Session titles', () => {
  it('takes the first non-empty body line and collapses whitespace', () => {
    expect(inboundSessionTitle(`[Human DM]\n${metadata}\n  Fix\t the   build  \nSecond line`)).toBe(
      'Fix the build',
    );
    expect(inboundSessionTitle('  Plain\ttext\nSecond line')).toBe('Plain text');
    expect(inboundSessionTitle(' \n\t')).toBeUndefined();
  });

  it('limits titles to 60 characters including the ellipsis, at a word boundary', () => {
    expect(inboundSessionTitle('a'.repeat(60))).toBe('a'.repeat(60));
    expect(inboundSessionTitle('a'.repeat(61))).toBe(`${'a'.repeat(59)}…`);
    expect(
      inboundSessionTitle('Fix the failing deployment pipeline before rolling out the new version'),
    ).toBe('Fix the failing deployment pipeline before rolling out the…');
    expect(inboundSessionTitle('🙂'.repeat(61))).toBe(`${'🙂'.repeat(59)}…`);
  });

  it('keeps generated titles bounded for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const title = inboundSessionTitle(text);
        if (title !== undefined) {
          expect(Array.from(title).length).toBeLessThanOrEqual(60);
          expect(title.trim()).toBe(title);
          expect(title).not.toMatch(/[\r\n\t]/u);
        }
      }),
    );
  });
});
