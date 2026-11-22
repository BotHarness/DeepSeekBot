import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session';
import { SessionQueryError, type SessionQueryEngine } from '@deepseek-ai/dsh-session-query';
import { scheduler } from 'node:timers/promises';
import { inboxWakeBody, parseInboundEnvelope } from '../../runtime/inbound-envelope.js';
import { sessionDirectBody } from '../../runtime/session-direct-message.js';
import { normalizeSessionSearch, type NativeSessions } from './host-sessions.js';

type Query = Pick<SessionQueryEngine, 'listSessions' | 'observeSession'>;
type SessionQueryMethods = Required<Pick<NativeSessions, 'searchHumanMessages' | 'sortTimes'>>;

function humanText(
  event: SessionEvent,
  source: 'native' | 'bot',
  readHumanMessage: (channelId: string, messageId: string) => string | undefined,
): string | undefined {
  if (event.type !== 'user/message' || event.data.source.kind !== 'user') return undefined;
  const text = event.data.content.flatMap((part) => (part.type === 'text' ? [part.text] : []));
  if (source === 'native') return text.join('\n');
  const prompt = text[0];
  if (prompt === undefined || inboxWakeBody(prompt) !== undefined) return undefined;
  const direct = sessionDirectBody(prompt);
  if (direct !== undefined) return direct;
  const envelope = parseInboundEnvelope(prompt);
  if (envelope?.channelId === undefined || envelope.messageId === undefined) return undefined;
  if (envelope.kind !== 'human-dm' && envelope.kind !== 'group' && envelope.kind !== 'inbox')
    return undefined;
  return readHumanMessage(envelope.channelId, envelope.messageId);
}

const OBSERVATION_BATCH_SIZE = 4;

async function observeSessions<T>(
  query: Query,
  ids: readonly string[],
  inspect: (id: string, events: readonly SessionEvent[], createdAt: number) => T,
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  for (let start = 0; start < ids.length; start += OBSERVATION_BATCH_SIZE) {
    if (start > 0) await scheduler.yield();
    await Promise.all(
      ids.slice(start, start + OBSERVATION_BATCH_SIZE).map(async (id) => {
        try {
          using observation = await query.observeSession(SessionId(id), { projectionMode: 'none' });
          results.set(id, inspect(id, observation.events, observation.header.createdAt));
        } catch (error) {
          if (
            !(error instanceof SessionQueryError) ||
            error.code !== 'SESSION_QUERY_SESSION_NOT_FOUND'
          )
            throw error;
        }
      }),
    );
  }
  return results;
}

export function hostSessionQueries(getQuery: () => Query): SessionQueryMethods {
  return {
    async searchHumanMessages(search, candidates, readHumanMessage) {
      const sources = new Map(candidates.map((row) => [row.sessionId, row.source.kind]));
      const matches = await observeSessions(getQuery(), [...sources.keys()], (id, events) => {
        const source = sources.get(id);
        return (
          source !== undefined &&
          events.some((event) => {
            const text = humanText(event, source, readHumanMessage);
            return text !== undefined && normalizeSessionSearch(text).includes(search);
          })
        );
      });
      return new Set([...matches].flatMap(([id, matched]) => (matched ? [id] : [])));
    },
    async sortTimes(sort, ids) {
      const query = getQuery();
      if (sort === 'created') {
        const wanted = new Set(ids);
        const records = await query.listSessions();
        return new Map(
          records.flatMap(({ header }) =>
            wanted.has(header.id) ? [[header.id, header.createdAt]] : [],
          ),
        );
      }
      return observeSessions(query, ids, (_id, events, createdAt) =>
        Math.max(createdAt, events.at(-1)?.time ?? 0),
      );
    },
  };
}
