import { shallowEqual } from '@deepseek-ai/dsh-client-store';

import type { BotSummary, ClientState } from './store.js';

type Shown = Pick<ClientState, 'selection' | 'conversation'>;

function shownBotSlugs({ selection, conversation }: Shown): Set<string> {
  const channel = conversation.channel;
  const slugs = new Set<string>(channel?.members ?? []);
  if (selection?.kind === 'bot') slugs.add(selection.slug);
  if (channel?.botSlug !== undefined) slugs.add(channel.botSlug);
  for (const message of conversation.messages)
    if (message.author.kind === 'bot') slugs.add(message.author.slug);
  for (const draft of conversation.drafts) slugs.add(draft.botSlug);
  return slugs;
}

function withoutActivity({
  aggregateState: _state,
  activity: _activity,
  attention: _attention,
  sessionActivity: _sessions,
  ...rest
}: BotSummary): Omit<BotSummary, 'aggregateState' | 'activity' | 'attention' | 'sessionActivity'> {
  return rest;
}

function sameBotsWhere(
  left: readonly BotSummary[],
  right: readonly BotSummary[],
  quiet: (slug: string) => boolean,
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((bot, index) => {
    const next = right[index]!;
    if (bot === next) return true;
    return (
      bot.slug === next.slug &&
      quiet(next.slug) &&
      shallowEqual(withoutActivity(bot), withoutActivity(next))
    );
  });
}

export function sameBotsBesidesActivity(
  left: readonly BotSummary[],
  right: readonly BotSummary[],
): boolean {
  return sameBotsWhere(left, right, () => true);
}

export function sameConversationBots(
  left: readonly BotSummary[],
  right: readonly BotSummary[],
  shown: Shown,
): boolean {
  let slugs: Set<string> | undefined;
  return sameBotsWhere(left, right, (slug) => !(slugs ??= shownBotSlugs(shown)).has(slug));
}
