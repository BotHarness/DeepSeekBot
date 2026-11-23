import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import {
  boundedByBytes,
  decodeReadCursor,
  encodeReadCursor,
  ReadContinuationError,
} from '../channels/read-cursor.js';

const CURSOR_KIND = 'bot-activity';

export interface BotActivityPageRequest {
  slug: string;
  incarnation: string;
  snapshot: PersonaBotActivitySnapshot;
  limit: number;
  cursor?: string;
  maxBytes?: number;
}

function startOf(request: BotActivityPageRequest): number {
  if (request.cursor === undefined) return 0;
  const { s, i, g, r, o } = decodeReadCursor(CURSOR_KIND, request.cursor);
  if (
    typeof s !== 'string' ||
    typeof i !== 'string' ||
    typeof g !== 'string' ||
    typeof r !== 'number' ||
    typeof o !== 'number' ||
    o < 1
  )
    throw new ReadContinuationError('invalid-read-cursor', 'The read cursor is malformed.');
  if (s !== request.slug)
    throw new ReadContinuationError(
      'changed-read-target',
      'The read cursor belongs to a different Bot.',
    );
  if (i !== request.incarnation)
    throw new ReadContinuationError(
      'changed-read-target',
      'The Bot was deleted and recreated since the first page.',
    );
  if (g !== request.snapshot.generation || r !== request.snapshot.revision)
    throw new ReadContinuationError(
      'stale-read-revision',
      'The Bot activity changed since the first page; read the first page again.',
    );
  return o;
}

export function readBotActivityPage(request: BotActivityPageRequest) {
  const { snapshot, slug } = request;
  const start = startOf(request);
  const bot = snapshot.bots.find((entry) => entry.slug === slug);
  const all = bot?.sessions ?? [];
  const sessions = boundedByBytes(all.slice(start, start + request.limit), request.maxBytes);
  const next = start + sessions.length;
  const complete = next >= all.length;
  return {
    generation: snapshot.generation,
    revision: snapshot.revision,
    bot:
      bot === undefined
        ? null
        : {
            ...bot,
            ...(bot.sessions === undefined ? {} : { sessions, sessionCount: all.length }),
          },
    provenance: {
      source: 'bot-activity' as const,
      slug,
      incarnation: request.incarnation,
      generation: snapshot.generation,
      revision: snapshot.revision,
      contentIsData: true as const,
    },
    complete,
    ...(complete
      ? {}
      : {
          nextCursor: encodeReadCursor(CURSOR_KIND, {
            s: slug,
            i: request.incarnation,
            g: snapshot.generation,
            r: snapshot.revision,
            o: next,
          }),
        }),
  };
}
