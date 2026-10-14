import type { SelectedMention } from './mentions.js';
import type { ChannelMessage } from './store.js';

export interface SelectedChannelRef {
  channelId: string;
  label: string;
  start: number;
  end: number;
}

export interface ChannelRefQuery {
  start: number;
  end: number;
  query: string;
}

export function activeChannelRefQuery(
  value: string,
  caret: number,
  refs: readonly SelectedChannelRef[],
): ChannelRefQuery | undefined {
  const start = value.lastIndexOf('#', caret - 1);
  if (start < 0 || caret - start > 64 || (start > 0 && /[A-Za-z0-9._%+-]/u.test(value[start - 1]!)))
    return undefined;
  const query = value.slice(start + 1, caret);
  if (/[\n\r@#]/u.test(query)) return undefined;
  if (refs.some((item) => item.start === start && item.end <= caret)) return undefined;
  return { start, end: caret, query };
}

export function rebaseChannelRefs(
  before: string,
  after: string,
  refs: readonly SelectedChannelRef[],
): SelectedChannelRef[] {
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
  return refs
    .flatMap((item) => {
      if (item.end <= prefix) return [item];
      if (item.start >= oldEnd)
        return [{ ...item, start: item.start + delta, end: item.end + delta }];
      return [];
    })
    .filter((item) => after.slice(item.start, item.end) === '#' + item.label);
}

export function selectChannelRef(
  value: string,
  refs: readonly SelectedChannelRef[],
  query: ChannelRefQuery,
  channelId: string,
  label: string,
): { value: string; refs: SelectedChannelRef[]; caret: number } {
  const token = '#' + label;
  const trailing = value[query.end] === ' ' ? '' : ' ';
  const next = value.slice(0, query.start) + token + trailing + value.slice(query.end);
  const rebased = rebaseChannelRefs(value, next, refs);
  const selected = { channelId, label, start: query.start, end: query.start + token.length };
  return {
    value: next,
    refs: [...rebased, selected].sort((a, b) => a.start - b.start),
    caret: selected.end + trailing.length,
  };
}

export function deleteSelectedChannelRef(
  value: string,
  refs: readonly SelectedChannelRef[],
  selectionStart: number,
  selectionEnd: number,
  key: 'Backspace' | 'Delete',
): { value: string; refs: SelectedChannelRef[]; caret: number } | undefined {
  const target = refs.find((ref) => {
    const trailingEnd = value[ref.end] === ' ' ? ref.end + 1 : ref.end;
    if (selectionStart !== selectionEnd)
      return selectionStart < trailingEnd && selectionEnd > ref.start;
    return key === 'Backspace'
      ? selectionStart > ref.start && selectionStart <= trailingEnd
      : selectionStart >= ref.start && selectionStart < ref.end;
  });
  if (target === undefined) return undefined;
  const end = value[target.end] === ' ' ? target.end + 1 : target.end;
  const start =
    selectionStart === selectionEnd ? target.start : Math.min(selectionStart, target.start);
  const finish = selectionStart === selectionEnd ? end : Math.max(selectionEnd, end);
  const next = value.slice(0, start) + value.slice(finish);
  return { value: next, refs: rebaseChannelRefs(value, next, refs), caret: start };
}

export type ReferenceRun<M extends SelectedMention = SelectedMention> =
  | { text: string; mention?: never; channelRef?: never; humanMention?: never }
  | { text: string; mention: M; channelRef?: never; humanMention?: never }
  | { text: string; mention?: never; channelRef: SelectedChannelRef; humanMention?: never }
  | {
      text: string;
      mention?: never;
      channelRef?: never;
      humanMention: NonNullable<ChannelMessage['humanMentions']>[number];
    };

export function referenceRuns<M extends SelectedMention>(
  value: string,
  mentions: readonly M[],
  refs: readonly SelectedChannelRef[],
  humanMentions: readonly NonNullable<ChannelMessage['humanMentions']>[number][] = [],
): ReferenceRun<M>[] {
  const tokens = [
    ...mentions.map((mention) => ({ start: mention.start, end: mention.end, mention })),
    ...refs.map((channelRef) => ({ start: channelRef.start, end: channelRef.end, channelRef })),
    ...humanMentions.map((humanMention) => ({
      start: humanMention.start,
      end: humanMention.end,
      humanMention,
    })),
  ].sort((a, b) => a.start - b.start);
  const runs: ReferenceRun<M>[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) continue;
    if ('mention' in token) {
      if (value.slice(token.start, token.end) !== '@' + token.mention.label) continue;
    } else if ('humanMention' in token) {
      if (value.slice(token.start, token.end) !== '@' + token.humanMention.label) continue;
    } else if (value.slice(token.start, token.end) !== '#' + token.channelRef.label) continue;
    if (token.start > cursor) runs.push({ text: value.slice(cursor, token.start) });
    if ('mention' in token)
      runs.push({ text: value.slice(token.start, token.end), mention: token.mention });
    else if ('humanMention' in token)
      runs.push({ text: value.slice(token.start, token.end), humanMention: token.humanMention });
    else runs.push({ text: value.slice(token.start, token.end), channelRef: token.channelRef });
    cursor = token.end;
  }
  if (cursor < value.length) runs.push({ text: value.slice(cursor) });
  return runs;
}
