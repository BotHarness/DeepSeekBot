import { humanContext, OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { ModelRoute } from '../models/presets.js';
import type { TeamService } from './service.js';
import { requireEngineAccountGrant } from './roles.js';
import { TeamError } from './error.js';
import { allowsEngineAccount, allowsModel } from './permissions.js';

export function engineAccountFilter(team: TeamService | undefined, human: HumanContext) {
  const grants = team?.roles.modelsAllowed(human);
  return grants === undefined
    ? () => human.humanId === OWNER_HUMAN_CONTEXT.humanId
    : (id: string) => allowsEngineAccount(grants, id);
}

function ownerOf(team: TeamService, bot: PersonaBotRecord) {
  return humanContext(bot.ownerHumanId ?? team.ownerContext().humanId);
}

export function botModelGrants(team: TeamService, bot: PersonaBotRecord) {
  return team.roles.modelsAllowed(ownerOf(team, bot));
}

export function requireBotEngineAccount(
  team: TeamService | undefined,
  bot: PersonaBotRecord | undefined,
  accountId: string,
): void {
  if (!team) return;
  if (!bot) throw new TeamError('bot-not-found');
  requireEngineAccountGrant(botModelGrants(team, bot), accountId);
}

export function botModelFilter(
  team: TeamService | undefined,
  bot: PersonaBotRecord | undefined,
): (route: ModelRoute) => boolean {
  if (!team || !bot) return () => true;
  const allowed = botModelGrants(team, bot);
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
