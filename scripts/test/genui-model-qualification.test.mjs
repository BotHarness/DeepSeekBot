import { describe, expect, it } from 'vitest';
import {
  findGenuiModelFollowup,
  genuiVerificationDigest,
  genuiMessageSelector,
} from '../genui-model-qualification.mjs';
import { genuiDocumentIdentity } from '../../packages/core/src/channels/genui-document.ts';
import { syntheticGenuiDocument } from '../../packages/core/test/fixtures/genui-document.ts';

describe('canonical document capture scope', () => {
  it('distinguishes two published messages that reuse the same document title', () => {
    expect(genuiMessageSelector('original')).toBe(
      '[data-message-id="original"] section[aria-label]',
    );
    expect(genuiMessageSelector('followup')).toBe(
      '[data-message-id="followup"] section[aria-label]',
    );
    expect(genuiMessageSelector('original')).not.toBe(genuiMessageSelector('followup'));
  });
});

const request = {
  channelId: 'dm-synthetic',
  slug: 'synthetic',
  after: '2026-11-08T00:00:00.000Z',
  predecessorMessageId: 'original',
  humanMessageId: 'human-request',
  sourceEvents: [
    { channelId: 'dm-synthetic', messageId: 'model-document', sourceEventId: 'canonical-source' },
    { channelId: 'dm-synthetic', messageId: 'human-request', sourceEventId: 'human-source' },
  ],
  admissions: [{ botSlug: 'synthetic', sourceEventId: 'human-source' }],
};
const message = {
  id: 'model-document',
  author: { kind: 'bot', slug: request.slug },
  at: '2026-11-08T00:00:01.000Z',
  genui: { version: 2, predecessorMessageId: 'original' },
};
const preview = {
  name: 'genui_preview',
  outcome: 'ok',
  callId: 'preview',
  result: `${JSON.stringify({ documentId: genuiVerificationDigest(message.genui), diagnostics: [] })}\n[image]`,
};
const publish = {
  name: 'bot_send_message',
  outcome: 'ok',
  callId: 'publish',
  args: { channel_id: request.channelId },
  result: JSON.stringify({
    status: 'committed',
    channelId: request.channelId,
    messageId: message.id,
  }),
};
const trace = {
  sessionId: 'real-orchestrator',
  turns: [{ turn: 1, startedAt: request.after, calls: [preview, publish] }],
};

describe('real-model GenUI qualification', () => {
  it('independently matches the owner identity for the complete normalized fixture', () => {
    expect(genuiVerificationDigest(syntheticGenuiDocument)).toBe(
      genuiDocumentIdentity(syntheticGenuiDocument),
    );
  });

  it('supports checked source-based reply routing without inventing a channel_id requirement', () => {
    const routed = { ...publish, args: { source_event_id: 'human-source' } };
    expect(
      findGenuiModelFollowup(
        [message],
        { ...trace, turns: [{ ...trace.turns[0], calls: [preview, routed] }] },
        request,
      )?.message.id,
    ).toBe(message.id);
  });
  it('requires canonical linked content and an ordered successful model preview/publication', () => {
    expect(findGenuiModelFollowup([message], trace, request)).toEqual({
      message,
      sourceEventId: 'canonical-source',
      sessionId: 'real-orchestrator',
      turn: 1,
      previewCallId: 'preview',
      publishCallId: 'publish',
    });
  });

  it.each([
    { ...message, author: { kind: 'human' } },
    { ...message, author: { kind: 'bot', slug: 'other' } },
    { ...message, at: request.after },
    { ...message, genui: { version: 1, predecessorMessageId: 'original' } },
    { ...message, genui: { version: 2, predecessorMessageId: 'other' } },
  ])('does not qualify unrelated, old, unattributed or legacy content: %j', (candidate) => {
    expect(findGenuiModelFollowup([candidate], trace, request)).toBeUndefined();
  });

  it.each([
    { sourceEvents: [] },
    { sourceEvents: [{ ...request.sourceEvents[0], channelId: 'other' }] },
    { sourceEvents: [{ ...request.sourceEvents[0], sourceEventId: '' }] },
    { sourceEvents: [{ ...request.sourceEvents[0], messageId: 'other' }] },
    { admissions: [] },
    { admissions: [{ botSlug: 'other' }] },
    { admissions: [{ botSlug: 'synthetic', sourceEventId: 'unrelated' }] },
  ])(
    'requires same-channel canonical placement and actual Human-request admission: %j',
    (evidence) => {
      expect(findGenuiModelFollowup([message], trace, { ...request, ...evidence })).toBeUndefined();
    },
  );

  it.each([
    {
      ...trace,
      turns: [
        {
          ...trace.turns[0],
          calls: [
            { ...preview, result: JSON.stringify({ documentId: 'other', diagnostics: [] }) },
            publish,
          ],
        },
      ],
    },
    {
      ...trace,
      turns: [
        {
          ...trace.turns[0],
          calls: [
            {
              ...preview,
              result: JSON.stringify({
                documentId: genuiVerificationDigest(message.genui),
                diagnostics: ['script failed'],
              }),
            },
            publish,
          ],
        },
      ],
    },
    {
      ...trace,
      turns: [
        {
          ...trace.turns[0],
          calls: [preview, { ...publish, args: { source_event_id: 'unrelated' } }],
        },
      ],
    },
    { sessionId: 'direct', turns: trace.turns },
    { turns: trace.turns },
    { ...trace, turns: [{ ...trace.turns[0], startedAt: 'invalid' }] },
    { ...trace, turns: [{ ...trace.turns[0], startedAt: '2026-11-07T00:00:00Z' }] },
    { ...trace, turns: [{ ...trace.turns[0], calls: [publish, preview] }] },
    {
      ...trace,
      turns: [{ ...trace.turns[0], calls: [preview, { ...publish, outcome: 'error' }] }],
    },
    {
      ...trace,
      turns: [{ ...trace.turns[0], calls: [{ ...preview, outcome: 'error' }, publish] }],
    },
    {
      ...trace,
      turns: [
        { ...trace.turns[0], calls: [preview, { ...publish, args: { channel_id: 'other' } }] },
      ],
    },
    {
      ...trace,
      turns: [{ ...trace.turns[0], calls: [preview, { ...publish, result: '{truncated' }] }],
    },
    {
      ...trace,
      turns: [
        {
          ...trace.turns[0],
          calls: [
            preview,
            {
              ...publish,
              result: JSON.stringify({
                status: 'committed',
                channelId: request.channelId,
                messageId: 'unrelated',
              }),
            },
          ],
        },
      ],
    },
    {
      ...trace,
      turns: [
        { ...trace.turns[0], calls: [preview] },
        { ...trace.turns[0], turn: 2, calls: [publish] },
      ],
    },
  ])(
    'does not count a direct Tool run or incomplete/mismatched model provenance: %j',
    (candidate) => {
      expect(findGenuiModelFollowup([message], candidate, request)).toBeUndefined();
    },
  );
});
