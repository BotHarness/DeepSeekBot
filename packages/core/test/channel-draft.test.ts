import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { describe, expect, it } from 'vitest';

import { ChannelDraftTracker, type ChannelDraftEvent } from '../src/channels/draft.js';

function delta(
  argumentsDelta: string,
  name = 'bot_send_message',
  index = 0,
  blockIndex = 0,
): AssistantStreamFrame {
  return {
    type: 'chunk',
    attemptId: 'attempt-1',
    revision: 1,
    index,
    time: 1,
    chunk: { type: 'tool-call-delta', index: blockIndex, id: 'call-1', name, argumentsDelta },
  } as AssistantStreamFrame;
}

function tracker() {
  const events: ChannelDraftEvent[] = [];
  const drafts = new ChannelDraftTracker((event) => events.push(event));
  drafts.begin('orchestrator-ada', {
    channelId: 'dm-ada',
    botSlug: 'ada',
    canAccess: (id) => id === 'dm-ada' || id === 'group-team',
  });
  return { drafts, events };
}

describe('Orchestrator Channel draft tracker', () => {
  it('routes unified reply previews by trusted source and never falls back for external sources', () => {
    const { drafts, events } = tracker();
    drafts.begin('orchestrator-ada', {
      channelId: 'dm-ada',
      botSlug: 'ada',
      canAccess: () => true,
      replyChannel: (source) => (source === 'local-source' ? 'group-team' : undefined),
    });
    drafts.accept(
      'orchestrator-ada',
      delta('{"source_event_id":"external-source","body":"private"}', 'bot_send_message'),
    );
    expect(events).toEqual([]);
    drafts.end('orchestrator-ada');
    drafts.begin('orchestrator-ada', {
      channelId: 'dm-ada',
      botSlug: 'ada',
      canAccess: () => true,
      replyChannel: (source) => (source === 'local-source' ? 'group-team' : undefined),
    });
    drafts.accept(
      'orchestrator-ada',
      delta('{"source_event_id":"local-source","body":"hello', 'bot_send_message'),
    );
    expect(events).toMatchObject([
      { type: 'update', draft: { channelId: 'group-team', body: 'hello' } },
    ]);
  });

  it('projects real tool-argument fragments into successive DM bodies, not assistant finals', () => {
    const { drafts, events } = tracker();
    drafts.accept('assignment-1', delta('{"channel_id":"dm-ada","body":"wrong"}'));
    drafts.accept('orchestrator-ada', delta('{"purpose":"work"}', 'create_assignment'));
    for (const [index, fragment] of [
      '{"channel_id":"dm-ada","body":"你',
      '好',
      '，',
      '世',
      '界"}',
    ].entries()) {
      drafts.accept('orchestrator-ada', delta(fragment, 'bot_send_message', index + 1, 1));
    }
    expect(
      events.filter((event) => event.type === 'update').map((event) => event.draft.body),
    ).toEqual(['你', '你好', '你好，', '你好，世', '你好，世界']);
    expect(events[0]).toMatchObject({
      type: 'update',
      draft: { channelId: 'dm-ada', botSlug: 'ada' },
    });
    drafts.end('orchestrator-ada');
    expect(events.at(-1)).toMatchObject({ type: 'abandoned', channelId: 'dm-ada' });
  });

  it('decodes incomplete JSON escapes and abandons the preview without committing', () => {
    const { drafts, events } = tracker();
    for (const [index, fragment] of [
      '{"channel_id":"dm-ada","body":"第',
      '一\\',
      'n行',
      '"}',
    ].entries()) {
      drafts.accept('orchestrator-ada', delta(fragment, 'bot_send_message', index));
    }
    expect(events.filter((event) => event.type === 'update').at(-1)).toMatchObject({
      draft: { body: '第一\n行' },
    });
    drafts.accept('orchestrator-ada', {
      type: 'end',
      attemptId: 'attempt-1',
      revision: 2,
      index: 4,
      outcome: { kind: 'abandoned' },
    } as AssistantStreamFrame);
    expect(events.at(-1)?.type).toBe('abandoned');
  });

  it('moves a draft only to a joined explicit Channel', () => {
    const { drafts, events } = tracker();
    drafts.accept('orchestrator-ada', delta('{"body":"hello","channel_id":"group-team"}'));
    expect(events).toMatchObject([{ type: 'update', draft: { channelId: 'group-team' } }]);
    drafts.end('orchestrator-ada');
    drafts.begin('orchestrator-ada', {
      channelId: 'dm-ada',
      botSlug: 'ada',
      canAccess: (id) => id === 'dm-ada',
    });
    drafts.accept('orchestrator-ada', delta('{"body":"private","channel_id":"group-team"}'));
    expect(events.filter((event) => event.type === 'update')).toHaveLength(1);
  });

  it('does not project a turn that never calls bot_send_message', () => {
    const { drafts, events } = tracker();
    drafts.accept('orchestrator-ada', delta('{"purpose":"work"}', 'create_assignment'));
    drafts.end('orchestrator-ada');
    expect(events).toEqual([]);
  });

  it('waits for an explicit destination before publishing a preview', () => {
    const { drafts, events } = tracker();
    drafts.accept('orchestrator-ada', delta('{"body":"先'));
    expect(events).toEqual([]);
    drafts.accept(
      'orchestrator-ada',
      delta('发","channel_id":"group-team"}', 'bot_send_message', 1),
    );
    expect(events).toMatchObject([
      { type: 'update', draft: { channelId: 'group-team', body: '先发' } },
    ]);
    drafts.settle('orchestrator-ada', 'group-team', '先发');
    drafts.end('orchestrator-ada');
    expect(events.at(-1)).toMatchObject({ type: 'settled', channelId: 'group-team' });
  });

  it('discards a gapped attempt and never turns it into a durable message', () => {
    const { drafts, events } = tracker();
    drafts.accept('orchestrator-ada', delta('{"channel_id":"dm-ada","body":"先'));
    drafts.accept('orchestrator-ada', delta('发', 'bot_send_message', 2));
    drafts.accept('orchestrator-ada', delta('完"}', 'bot_send_message', 3));
    expect(events).toMatchObject([
      { type: 'update', draft: { body: '先' } },
      { type: 'abandoned', reason: 'interrupted' },
    ]);
  });

  it('settles the sole preview when the final tool body corrects its partial text', () => {
    const { drafts, events } = tracker();
    drafts.accept('orchestrator-ada', delta('{"channel_id":"dm-ada","body":"partial'));
    drafts.settle('orchestrator-ada', 'dm-ada', 'corrected');
    drafts.end('orchestrator-ada');
    expect(events.map((event) => event.type)).toEqual(['update', 'settled']);
  });

  it('abandons an old attempt before accepting a replacement attempt', () => {
    const { drafts, events } = tracker();
    drafts.accept('orchestrator-ada', delta('{"channel_id":"dm-ada","body":"旧'));
    drafts.accept('orchestrator-ada', {
      ...delta('{"channel_id":"dm-ada","body":"新'),
      attemptId: 'attempt-2',
    } as AssistantStreamFrame);
    expect(events).toMatchObject([
      { type: 'update', draft: { attemptId: 'attempt-1', body: '旧' } },
      { type: 'abandoned', attemptId: 'attempt-1', reason: 'interrupted' },
      { type: 'update', draft: { attemptId: 'attempt-2', body: '新' } },
    ]);
  });
});
