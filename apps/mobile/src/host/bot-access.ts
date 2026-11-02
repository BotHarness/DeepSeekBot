import { HostAnswerInvalid } from './bot-settings';
import type { HostClient, RosterBot } from './client';

export type BotAccessKind = 'browser' | 'computer';

export type BotAccess = Record<BotAccessKind, boolean>;

const METHOD = {
  browser: 'browserAccessSet',
  computer: 'computerAccessSet',
} as const satisfies Record<BotAccessKind, string>;

const FIELD = {
  browser: 'browserAccess',
  computer: 'computerAccess',
} as const satisfies Record<BotAccessKind, string>;

export function botAccess(bot: RosterBot): BotAccess {
  return (
    bot.hostAccess ?? {
      browser: bot.browserAccess,
      computer: bot.computerAccess,
    }
  );
}

export async function setBotAccess(
  client: HostClient,
  slug: string,
  kind: BotAccessKind,
  enabled: boolean,
): Promise<boolean> {
  const answer = await client.call<unknown>(METHOD[kind], { slug, enabled });
  const bot =
    typeof answer === 'object' && answer !== null
      ? (answer as { bot?: Record<string, unknown> }).bot
      : undefined;
  const value = bot?.[FIELD[kind]] ?? false;
  if (typeof bot !== 'object' || bot === null || bot['slug'] !== slug || typeof value !== 'boolean')
    throw new HostAnswerInvalid(`${METHOD[kind]} returned no Bot.`);
  void client.refresh().catch(() => undefined);
  return value;
}
