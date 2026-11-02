import { Lexer } from 'marked';
import remend from 'remend';
import { textMarkdownSupported } from '../markdown-blocks';
import type { WireMention } from '../../host/wire';

export function mentionMarkdownBody(body: string, streaming: boolean) {
  const normalized = body.replace(/\r\n?/g, '\n');
  const source = streaming ? remend(normalized) : normalized;
  const first = Lexer.lex(source, { gfm: true })[0];
  return first?.type === 'paragraph' && textMarkdownSupported([first])
    ? { first, rest: source.slice(first.raw.length) }
    : undefined;
}

export function messageMentionRuns(body: string, mentions: readonly WireMention[] = []) {
  const runs: { text: string; mention?: WireMention }[] = [];
  let cursor = 0;
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    if (
      !Number.isInteger(mention.start) ||
      !Number.isInteger(mention.end) ||
      mention.start < cursor ||
      mention.end <= mention.start ||
      mention.end > body.length ||
      body.slice(mention.start, mention.end) !== '@' + mention.label
    )
      continue;
    if (mention.start > cursor) runs.push({ text: body.slice(cursor, mention.start) });
    runs.push({ text: body.slice(mention.start, mention.end), mention });
    cursor = mention.end;
  }
  if (cursor < body.length) runs.push({ text: body.slice(cursor) });
  return runs;
}

export function leadingMessageMentions(body: string, mentions: readonly WireMention[] = []) {
  if (mentions.length === 0) return undefined;
  const ordered = [...mentions].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const mention of ordered) {
    if (
      !Number.isInteger(mention.end) ||
      mention.start !== cursor ||
      mention.end <= mention.start ||
      mention.end > body.length ||
      body.slice(mention.start, mention.end) !== '@' + mention.label
    )
      return undefined;
    cursor = mention.end;
    if (body[cursor] === ' ') cursor += 1;
    else if (cursor < body.length) return undefined;
  }
  return { mentions: ordered, text: body.slice(cursor) };
}

export function mentionIdentity<T extends { slug: string; displayName: string }>(
  mention: WireMention,
  bots: readonly T[],
): { label: string; bot: T | undefined } {
  const bot = bots.find((candidate) => candidate.slug === mention.botSlug);
  return { label: bot?.displayName ?? mention.label, bot };
}
