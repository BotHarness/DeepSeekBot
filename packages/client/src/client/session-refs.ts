import { personaBotSessionRows } from './session-rows.js';
import type { BotSummary, OwnedSessionSummary } from './store.js';

export interface ComposerSessionOption {
  botSlug: string;
  bot?: BotSummary | undefined;
  sessionId: string;
  title: string;
  done: boolean;
  updatedAt: number;
}

export interface SessionQuery {
  start: number;
  end: number;
  query: string;
}

export interface SessionReferenceRun {
  text: string;
  start: number;
  end: number;
  session?: { sessionId: string; title: string };
}

const SESSION_ID = /^[A-Za-z0-9_.:-]{1,200}$/u;
const REFERENCE = /\[((?:\\.|[^\]\\\n])*)\]\(session:([A-Za-z0-9_.:-]{1,200})\)/gu;
export const SESSION_MENU_LIMIT = 8;

export function sessionReferenceText(option: Pick<ComposerSessionOption, 'sessionId' | 'title'>) {
  if (!SESSION_ID.test(option.sessionId)) throw new Error('invalid session id');
  const title = (option.title.trim() || option.sessionId)
    .replace(/[\r\n]+/gu, ' ')
    .replace(/[\\[\]]/gu, '\\$&');
  return `[${title}](session:${option.sessionId})`;
}

export function sessionReferenceRuns(value: string): SessionReferenceRun[] {
  const runs: SessionReferenceRun[] = [];
  let cursor = 0;
  for (const match of value.matchAll(REFERENCE)) {
    const start = match.index;
    if (start > cursor) runs.push({ text: value.slice(cursor, start), start: cursor, end: start });
    const end = start + match[0].length;
    runs.push({
      text: match[0],
      start,
      end,
      session: { sessionId: match[2]!, title: match[1]!.replace(/\\(.)/gu, '$1') },
    });
    cursor = end;
  }
  if (cursor < value.length)
    runs.push({ text: value.slice(cursor), start: cursor, end: value.length });
  return runs;
}

export function activeSessionQuery(value: string, caret: number): SessionQuery | undefined {
  const match = /(^|\s)\/([^\s/]{0,64})$/u.exec(value.slice(0, caret));
  if (match === null) return undefined;
  const query = match[2]!;
  return { start: caret - query.length - 1, end: caret, query };
}

export function composerSessionOptions(
  owned: readonly {
    botSlug: string;
    bot?: BotSummary | undefined;
    items: readonly OwnedSessionSummary[];
  }[],
): ComposerSessionOption[] {
  return owned.flatMap(({ botSlug, bot, items }) =>
    personaBotSessionRows(items, {}, 'all').flatMap((row) =>
      row.role !== 'assignment'
        ? []
        : [
            {
              botSlug,
              bot,
              sessionId: row.sessionId,
              title: row.title,
              done: row.archived === true || row.section === 'resolved',
              updatedAt: row.updatedAt,
            },
          ],
    ),
  );
}

export function rankSessionOptions(
  options: readonly ComposerSessionOption[],
  query: string,
): ComposerSessionOption[] {
  const needle = query.trim().toLocaleLowerCase();
  const scored = options.flatMap((option) => {
    if (needle === '') return option.done ? [] : [{ option, score: 0 }];
    const title = option.title.toLocaleLowerCase();
    const bot = (option.bot?.displayName ?? option.botSlug).toLocaleLowerCase();
    const score = title.startsWith(needle)
      ? 0
      : title.includes(needle)
        ? 1
        : option.sessionId.toLocaleLowerCase().startsWith(needle)
          ? 2
          : bot.includes(needle)
            ? 3
            : undefined;
    return score === undefined ? [] : [{ option, score: score + (option.done ? 4 : 0) }];
  });
  return scored
    .sort(
      (left, right) => left.score - right.score || right.option.updatedAt - left.option.updatedAt,
    )
    .slice(0, SESSION_MENU_LIMIT)
    .map((entry) => entry.option);
}

export function selectSession(
  value: string,
  query: SessionQuery,
  option: Pick<ComposerSessionOption, 'sessionId' | 'title'>,
): { value: string; caret: number } {
  const token = sessionReferenceText(option);
  const trailing = value[query.end] === ' ' ? '' : ' ';
  const next = value.slice(0, query.start) + token + trailing + value.slice(query.end);
  return { value: next, caret: query.start + token.length + trailing.length };
}

export function deleteSessionReference(
  value: string,
  selection: { start: number; end: number },
  key: 'Backspace' | 'Delete',
): { value: string; caret: number } | undefined {
  const target = sessionReferenceRuns(value).find((run) => {
    if (run.session === undefined) return false;
    const trailingEnd = value[run.end] === ' ' ? run.end + 1 : run.end;
    if (selection.start !== selection.end)
      return selection.start < trailingEnd && selection.end > run.start;
    return key === 'Backspace'
      ? selection.start > run.start && selection.start <= trailingEnd
      : selection.start >= run.start && selection.start < run.end;
  });
  if (target === undefined) return undefined;
  const start = Math.min(selection.start, target.start);
  const end = Math.max(selection.end, target.end + (value[target.end] === ' ' ? 1 : 0));
  return { value: value.slice(0, start) + value.slice(end), caret: start };
}
