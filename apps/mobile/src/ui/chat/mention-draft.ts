import {
  activeMentionQuery,
  rebaseMentions,
  selectMention,
  type MentionQuery,
  type SelectedMention,
} from '../../../../../packages/client/src/client/mentions';
import type { RosterBot } from '../../host/client';
import type { MessageTags } from '../../host/conversation';
import type { WireAllBotPreview } from '../../host/wire';

export { activeMentionQuery, rebaseMentions, type MentionQuery, type SelectedMention };

export type MentionCandidate =
  | { kind: 'bot'; bot: RosterBot }
  | { kind: 'all'; label: string; preview: WireAllBotPreview };

const MAX_CANDIDATES = 8;

export function mentionCandidates(
  members: readonly RosterBot[],
  query: MentionQuery | undefined,
  mentions: readonly SelectedMention[],
  all: { label: string; preview: WireAllBotPreview | undefined },
): MentionCandidate[] {
  if (query === undefined) return [];
  const needle = query.query.toLocaleLowerCase();
  const bots = members
    .filter(
      (bot) =>
        !bot.paused &&
        (bot.displayName.toLocaleLowerCase().includes(needle) ||
          bot.slug.toLocaleLowerCase().includes(needle)),
    )
    .slice(0, MAX_CANDIDATES)
    .map((bot): MentionCandidate => ({ kind: 'bot', bot }));
  const offerAll =
    all.preview !== undefined &&
    all.preview.recipients.length > 0 &&
    !mentions.some((item) => item.kind === 'all-bots') &&
    [all.label.toLocaleLowerCase(), 'all', '所有'].some((name) => name.includes(needle));
  return offerAll && all.preview !== undefined
    ? [{ kind: 'all', label: all.label, preview: all.preview }, ...bots]
    : bots;
}

export function chooseMention(
  value: string,
  mentions: readonly SelectedMention[],
  query: MentionQuery,
  candidate: MentionCandidate,
): { value: string; mentions: SelectedMention[]; caret: number } {
  if (candidate.kind === 'bot')
    return selectMention(value, mentions, query, candidate.bot.slug, candidate.bot.displayName);
  const selected = selectMention(value, mentions, query, '', candidate.label);
  return {
    ...selected,
    mentions: selected.mentions.map((item): SelectedMention =>
      item.botSlug === '' && item.kind === undefined
        ? {
            kind: 'all-bots',
            label: item.label,
            start: item.start,
            end: item.end,
            preview: candidate.preview,
          }
        : item,
    ),
  };
}

export function submittedMessage(
  draft: string,
  mentions: readonly SelectedMention[],
): { body: string; tags: MessageTags } {
  const body = draft.trim();
  const leftTrim = draft.length - draft.trimStart().length;
  const kept = mentions.flatMap((token) => {
    const start = token.start - leftTrim;
    const end = token.end - leftTrim;
    return start >= 0 && body.slice(start, end) === '@' + token.label
      ? [{ ...token, start, end }]
      : [];
  });
  const all = kept.find((item) => item.kind === 'all-bots');
  const named = kept.flatMap((item) =>
    item.kind === 'all-bots'
      ? []
      : [{ botSlug: item.botSlug, label: item.label, start: item.start, end: item.end }],
  );
  return {
    body,
    tags: {
      ...(named.length === 0 ? {} : { mentions: named }),
      ...(all?.kind === 'all-bots'
        ? {
            allBotMention: {
              start: all.start,
              end: all.end,
              label: all.label,
              preview: all.preview,
            },
          }
        : {}),
    },
  };
}
