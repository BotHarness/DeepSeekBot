import { humanContext } from '../humans/context.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { ModelRoute } from '../models/presets.js';
import type { TeamService } from './service.js';
import { TeamError } from './error.js';
import { allowsModel } from './permissions.js';

function ownerOf(team: TeamService, bot: PersonaBotRecord) {
  return humanContext(bot.ownerHumanId ?? team.ownerContext().humanId);
}

export function botModelFilter(
  team: TeamService | undefined,
  bot: PersonaBotRecord | undefined,
): (route: ModelRoute) => boolean {
  if (!team || !bot) return () => true;
  const allowed = team.roles.modelsAllowed(ownerOf(team, bot));
  return (route) => allowsModel(allowed, route);
}

export function requireBotModel(
  team: TeamService | undefined,
  bot: PersonaBotRecord | undefined,
  route: ModelRoute,
): void {
  if (!team || !bot) return;
  team.roles.requireModel(ownerOf(team, bot), route);
}
export function botModelAllowed(
  team: TeamService | undefined,
  bot: PersonaBotRecord,
  fallback?: ModelRoute,
): boolean {
  const routes = [bot.modelPlan?.orchestrator ?? fallback, bot.modelPlan?.assignmentDefault];
  try {
    for (const route of routes) if (route) requireBotModel(team, bot, route);
    return true;
  } catch (error) {
    if (error instanceof TeamError && error.code === 'model-not-allowed') return false;
    throw error;
  }
}
