import {
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm';
import { Session, SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session';
import { describe, expect, it, vi } from 'vitest';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { hostSessionQueries } from '../src/features/sessions/dsh-host-session-query.js';
import { sessionDirectPrompt } from '../src/runtime/session-direct-message.js';

const user = (text: string, time: number): SessionEvent<'user/message'> => ({
  type: 'user/message',
  seq: SessionSeq(1),
  time,
  data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  surfaceOp: 'append',
});

function fixture(eventsById: Record<string, SessionEvent[]>) {
  const entries = Object.entries(eventsById).map(([id, events], index) => ({
    session: Session.create(SessionId(id)),
    createdAt: 10 + index,
    events,
  }));
  const release = vi.fn();
  const query = hostSessionQueries(() => ({
    listSessions: async () =>
      entries.map(({ session, createdAt }) => ({
        header: { ...session.header, createdAt },
        live: true,
        persisted: true,
      })),
    observeSession: async (id) => {
      const entry = entries.find(({ session }) => session.id === id);
      if (entry === undefined) throw new Error('Unexpected Session read');
      const observation = {
        source: 'live' as const,
        header: { ...entry.session.header, createdAt: entry.createdAt },
        inheritedEventCount: entry.session.inheritedEventCount,
        cursor: entry.events.at(-1)?.seq ?? SessionSeq(0),
        events: entry.events,
        retain: () => observation,
        [Symbol.dispose]: release,
      };
      return observation;
    },
  }));
  return { query, release };
}

const native = (sessionId: string): HostSessionRow => ({
  sessionId,
  running: false,
  lastPromptAt: null,
  updatedAt: 0,
  source: { kind: 'native' },
});
const bot = (sessionId: string): HostSessionRow => ({
  ...native(sessionId),
  source: { kind: 'bot', botSlug: 'helper', displayName: 'Helper' },
});

describe('Phone Session Query', () => {
  it('finds Human substrings and excludes model replies, tool results and synthetic Bot inputs', async () => {
    const { query, release } = fixture({
      native: [user('请审查预算方案', 15)],
      bot: [
        user('[Group]\nChannel: room\nMessage ID: human-1\n请审查预算方案', 16),
        user(sessionDirectPrompt('Direct Human follow-up', 'source-1'), 17),
      ],
      other: [
        user('[Group]\nChannel: room\nMessage ID: bot-1\n请审查预算方案', 16),
        user('[Open Inbox] 2 items you have seen\n请审查预算方案', 17),
        {
          type: 'assistant/message',
          seq: SessionSeq(4),
          time: 18,
          surfaceOp: 'append',
          data: {
            turn: 1,
            step: 1,
            stream: [],
            message: createAssistantMessage({
              content: [{ type: 'text', text: '预算方案' }],
              source: { provider: 'test', model: 'test' },
            }),
          },
        },
        {
          type: 'tool/result',
          seq: SessionSeq(5),
          time: 19,
          surfaceOp: 'append',
          data: {
            turn: 1,
            step: 1,
            message: createToolResultMessage({
              callId: ToolCallId('call-1'),
              content: [{ type: 'text', text: '预算方案' }],
              isError: false,
            }),
          },
        },
      ],
    });
    const read = (_channelId: string, messageId: string) =>
      messageId === 'human-1' ? '请审查预算方案' : undefined;
    const rows = [native('native'), bot('bot'), bot('other')];
    expect(await query.searchHumanMessages('预算', rows, read)).toEqual(new Set(['native', 'bot']));
    expect(await query.searchHumanMessages('human follow-up', rows, read)).toEqual(
      new Set(['bot']),
    );
    expect(release).toHaveBeenCalledTimes(6);
  });

  it('uses header creation and the last event as distinct timestamps', async () => {
    const { query } = fixture({ old: [user('Earlier prompt', 15)], new: [] });
    expect(await query.sortTimes('created', ['old', 'new'])).toEqual(
      new Map([
        ['old', 10],
        ['new', 11],
      ]),
    );
    expect(await query.sortTimes('last-activity', ['old', 'new'])).toEqual(
      new Map([
        ['old', 15],
        ['new', 11],
      ]),
    );
  });
});
