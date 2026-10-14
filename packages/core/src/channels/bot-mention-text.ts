export interface BotMentionCandidate {
  botSlug: string;
  displayName: string;
  eligible: boolean;
}

export class AmbiguousBotMentionError extends Error {
  constructor(label: string, botSlugs: readonly string[]) {
    super(
      `@${label} matches several Bots in this Group (${botSlugs.join(', ')}); pass the intended ID in mention_bot_ids and leave the name out of body`,
    );
    this.name = 'AmbiguousBotMentionError';
  }
}

export function botMentionLabel(displayName: string): string {
  return displayName.replace(/\s+/gu, ' ').trim().slice(0, 80);
}

const WORD = /[A-Za-z0-9_]/u;
const LOCAL_PART = /[A-Za-z0-9._%+-]/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function resolveBotMentionText(
  body: string,
  candidates: readonly BotMentionCandidate[],
): { body: string; botSlugs: string[] } {
  const text = body.replaceAll('⁠', '');
  const patterns = candidates
    .map((candidate) => {
      const label = botMentionLabel(candidate.displayName);
      return {
        ...candidate,
        label,
        key: label.toLowerCase(),
        pattern: new RegExp('^' + label.split(' ').map(escapeRegExp).join('[\\s\\u00a0]+'), 'iu'),
      };
    })
    .filter((candidate) => candidate.label.length > 0);
  const matches: { start: number; end: number; botSlug: string }[] = [];
  let index = text.indexOf('@');
  while (index >= 0) {
    let next = index + 1;
    if (index === 0 || !LOCAL_PART.test(text[index - 1]!)) {
      const rest = text.slice(index + 1);
      const found = patterns.flatMap((candidate) => {
        const match = candidate.pattern.exec(rest)?.[0];
        if (match === undefined) return [];
        if (WORD.test(match.at(-1)!) && WORD.test(rest[match.length] ?? '')) return [];
        return [{ candidate, length: match.length }];
      });
      const longest = Math.max(0, ...found.map((item) => item.length));
      const winners = found.filter((item) => item.length === longest);
      const eligible = [
        ...new Set(
          winners.filter((item) => item.candidate.eligible).map((item) => item.candidate.botSlug),
        ),
      ];
      if (eligible.length > 1)
        throw new AmbiguousBotMentionError(winners[0]!.candidate.label, eligible);
      if (eligible.length === 1) {
        matches.push({ start: index, end: index + 1 + longest, botSlug: eligible[0]! });
        next = index + 1 + longest;
      } else if (longest > 0) next = index + 1 + longest;
    }
    index = text.indexOf('@', next);
  }
  if (matches.length === 0) return { body: text, botSlugs: [] };
  let output = '';
  let cursor = 0;
  let leading = true;
  let dropped = false;
  for (const match of matches) {
    const gap = text.slice(cursor, match.start);
    if (leading && gap.trim() === '') {
      cursor = match.end;
      dropped = true;
      continue;
    }
    leading = false;
    const label = patterns.find((candidate) => candidate.botSlug === match.botSlug)!.label;
    output += gap + label;
    cursor = match.end;
  }
  output += text.slice(cursor);
  return {
    body: dropped ? output.trimStart() : output,
    botSlugs: [...new Set(matches.map((match) => match.botSlug))],
  };
}
