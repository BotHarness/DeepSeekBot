import {
  seededAvatarFor,
  type AvatarRecipe,
} from '../../../../packages/core/src/bots/avatar-appearance';

export type BotAvatarChoice =
  | { kind: 'generated'; seed: string; origin?: 'initial' }
  | { kind: 'recipe'; recipe: AvatarRecipe }
  | { kind: 'photo'; image: string };

export function randomAvatarSeed(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function initialBotAvatar(seed = randomAvatarSeed()): BotAvatarChoice {
  return { kind: 'generated', seed, origin: 'initial' };
}

export function creationAvatarRecipe(avatar: BotAvatarChoice | undefined): AvatarRecipe {
  if (avatar?.kind === 'recipe') return avatar.recipe;
  return seededAvatarFor(avatar?.kind === 'generated' ? avatar.seed : 'Bot', undefined);
}
