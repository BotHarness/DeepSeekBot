import { LOCAL_HUMAN_ID } from '../kernel/local-human.js';

interface BotOwnership {
  ownerHumanId?: string | undefined;
}

export const botOwner = (bot: BotOwnership): string => bot.ownerHumanId ?? LOCAL_HUMAN_ID;

export function ownsBot(human: { humanId: string }, bot: BotOwnership | undefined): boolean {
  return bot !== undefined && botOwner(bot) === human.humanId;
}
