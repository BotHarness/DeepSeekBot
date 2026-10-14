import type { ChannelMessage } from './store.js';

const MARKDOWN_SIGNALS: readonly RegExp[] = [
  /^ {0,3}(?:`{3,}|~{3,})/mu,
  /`[^`\n]+`/u,
  /\*\*[^*\n]+\*\*|__[^_\n]+__/u,
  /~~[^~\n]+~~/u,
  /^ {0,3}#{1,6} \S/mu,
  /^ {0,3}> \S/mu,
  /^ {0,3}(?:[-*+]|\d{1,9}[.)]) \S/mu,
  /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/u,
  /^ {0,3}\|? *:?-{3,}:? *(?:\| *:?-{3,}:? *)+\|? *$/mu,
];

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_SIGNALS.some((pattern) => pattern.test(text));
}

export function preserveHumanLineBreaks(text: string): string {
  const lines = text.split('\n');
  let fence: string | undefined;
  return lines
    .map((line, index) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
      if (fence !== undefined) {
        if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length)
          fence = undefined;
        return line;
      }
      if (marker !== undefined) {
        fence = marker;
        return line;
      }
      const next = lines[index + 1];
      if (next === undefined || line.trim() === '' || next.trim() === '') return line;
      return line.endsWith('  ') ? line : `${line}  `;
    })
    .join('\n');
}

export function rendersHumanMarkdown(message: ChannelMessage): boolean {
  if (message.author.kind !== 'human' || message.format !== undefined) return false;
  if ((message.channelRefs?.length ?? 0) > 0) return false;
  if (/\]\(attachment:/u.test(message.body)) return false;
  const mentions = [...(message.mentions ?? []), ...(message.humanMentions ?? [])].sort(
    (left, right) => left.start - right.start,
  );
  let cursor = 0;
  for (const mention of mentions) {
    if (mention.start !== cursor) return false;
    cursor = mention.end;
    if (message.body[cursor] === ' ') cursor += 1;
  }
  return looksLikeMarkdown(message.body.slice(cursor));
}
