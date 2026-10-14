import type { AllBotPreview } from '../../../core/src/channels/all-bot-mention.js';
export type SelectedMention = {
  label: string;
  start: number;
  end: number;
} & (
  | { botSlug: string; kind?: never; preview?: never }
  | {
      kind: 'all-bots';
      preview: AllBotPreview;
      botSlug?: never;
    }
);

export interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

export function rebaseMentions(
  before: string,
  after: string,
  mentions: readonly SelectedMention[],
): SelectedMention[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix += 1;
  const oldEnd = before.length - suffix;
  const delta = after.length - before.length;
  return mentions
    .flatMap((item) => {
      if (item.end <= prefix) return [item];
      if (item.start >= oldEnd)
        return [{ ...item, start: item.start + delta, end: item.end + delta }];
      return [];
    })
    .filter((item) => after.slice(item.start, item.end) === '@' + item.label);
}

export function activeMentionQuery(
  value: string,
  caret: number,
  mentions: readonly SelectedMention[],
): MentionQuery | undefined {
  const start = value.lastIndexOf('@', caret - 1);
  if (start < 0 || caret - start > 34 || (start > 0 && /[A-Za-z0-9._%+-]/u.test(value[start - 1]!)))
    return undefined;
  const query = value.slice(start + 1, caret);
  if (/[\n\r@#]/u.test(query)) return undefined;
  if (mentions.some((item) => item.start === start && item.end <= caret)) return undefined;
  return { start, end: caret, query };
}

export function selectMention(
  value: string,
  mentions: readonly SelectedMention[],
  query: MentionQuery,
  botSlug: string,
  label: string,
): { value: string; mentions: SelectedMention[]; caret: number } {
  const token = '@' + label;
  const trailing = value[query.end] === ' ' ? '' : ' ';
  const next = value.slice(0, query.start) + token + trailing + value.slice(query.end);
  const rebased = rebaseMentions(value, next, mentions);
  const selected: SelectedMention = {
    botSlug,
    label,
    start: query.start,
    end: query.start + token.length,
  };
  return {
    value: next,
    mentions: [...rebased, selected].sort((a, b) => a.start - b.start),
    caret: selected.end + trailing.length,
  };
}

export function appendMention(
  value: string,
  mentions: readonly SelectedMention[],
  botSlug: string,
  label: string,
): { value: string; mentions: SelectedMention[]; caret: number } {
  if (mentions.some((item) => item.botSlug === botSlug))
    return { value, mentions: [...mentions], caret: value.length };
  const spaced = value.length === 0 || /\s$/u.test(value) ? value : value + ' ';
  return selectMention(
    spaced,
    mentions,
    { start: spaced.length, end: spaced.length, query: '' },
    botSlug,
    label,
  );
}

export function mentionRuns(
  value: string,
  mentions: readonly SelectedMention[],
): Array<{ text: string; mention?: SelectedMention }> {
  const runs: Array<{ text: string; mention?: SelectedMention }> = [];
  let cursor = 0;
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    if (mention.start < cursor || value.slice(mention.start, mention.end) !== '@' + mention.label)
      continue;
    if (mention.start > cursor) runs.push({ text: value.slice(cursor, mention.start) });
    runs.push({ text: value.slice(mention.start, mention.end), mention });
    cursor = mention.end;
  }
  if (cursor < value.length) runs.push({ text: value.slice(cursor) });
  return runs;
}

export function deleteSelectedMention(
  value: string,
  mentions: readonly SelectedMention[],
  selectionStart: number,
  selectionEnd: number,
  key: 'Backspace' | 'Delete',
): { value: string; mentions: SelectedMention[]; caret: number } | undefined {
  const target = mentions.find((mention) => {
    const trailingEnd = value[mention.end] === ' ' ? mention.end + 1 : mention.end;
    if (selectionStart !== selectionEnd)
      return selectionStart < trailingEnd && selectionEnd > mention.start;
    return key === 'Backspace'
      ? selectionStart > mention.start && selectionStart <= trailingEnd
      : selectionStart >= mention.start && selectionStart < mention.end;
  });
  if (target === undefined) return undefined;
  const end = value[target.end] === ' ' ? target.end + 1 : target.end;
  const start =
    selectionStart === selectionEnd ? target.start : Math.min(selectionStart, target.start);
  const finish = selectionStart === selectionEnd ? end : Math.max(selectionEnd, end);
  const next = value.slice(0, start) + value.slice(finish);
  return { value: next, mentions: rebaseMentions(value, next, mentions), caret: start };
}

export function sessionBotReference(botSlug: string): string {
  return '\u2060@' + botSlug;
}
