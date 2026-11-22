import { ENGINE_IDS, engineAccountKey } from '@botharness/host-protocol/subscription-engine';
import { z } from 'zod';
import type { BridgeMethodsDeps, BridgeResult } from '../bridge/methods.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { invalidInput, modelFailure } from '../models/provider-bridge.js';
import { ownsBot } from '../team/bot-access.js';
import { TeamError } from '../team/error.js';
import { engineAccountFilter, requireBotEngineAccount } from '../team/models.js';
import { requireEngineAccountGrant } from '../team/roles.js';
import type { EngineHost } from './engine-host.js';
import { EngineRefusal } from './engine-session.js';

export type EngineSelectionOperations = Pick<
  EngineHost,
  'target' | 'status' | 'models' | 'use' | 'validateChoice'
> & { store: Pick<EngineHost['store'], 'selections'> };

const nonempty = z.string().min(1);
const selectionRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), engine: nonempty.optional() }),
  z.object({ action: z.literal('models'), engine: nonempty }),
  z.object({
    action: z.literal('use'),
    bot: nonempty,
    role: z.enum(['orchestrator', 'assignment']),
    engine: z.enum(ENGINE_IDS).nullable(),
    accountId: nonempty.optional(),
    fallback: z.boolean().optional(),
    model: nonempty.optional(),
    effort: nonempty.optional(),
  }),
]);
export type EngineSelectionRequest = z.input<typeof selectionRequest>;

type EngineSelectionView =
  | {
      engines: Awaited<ReturnType<EngineHost['status']>>;
      selections: ReturnType<EngineHost['store']['selections']>;
    }
  | { engine: (typeof ENGINE_IDS)[number]; models: Awaited<ReturnType<EngineHost['models']>> }
  | Omit<Extract<EngineSelectionRequest, { action: 'use' }>, 'action'>;

export interface EngineSelectionBridgeMethods {
  engineSelection(payload: unknown): Promise<BridgeResult<EngineSelectionView>>;
}

export function createEngineSelectionBridge(
  human: HumanContext,
  {
    team,
    registry,
    engineSelection: host,
    localSubscriptionEngines,
    releaseEngineQuotaHold,
  }: Pick<
    BridgeMethodsDeps,
    'team' | 'engineSelection' | 'localSubscriptionEngines' | 'releaseEngineQuotaHold'
  > & { registry: Pick<BridgeMethodsDeps['registry'], 'get'> },
): EngineSelectionBridgeMethods {
  const isOwner = () => team?.isOwner(human) ?? human.humanId === OWNER_HUMAN_CONTEXT.humanId;
  const requireGrant = (id: string) => {
    if (team) requireEngineAccountGrant(team.roles.modelsAllowed(human), id);
    else if (!isOwner()) throw new TeamError('model-not-allowed', undefined, { route: id });
  };
  const matchingBot = (slug: string) => {
    const bot = registry.get(slug);
    if (bot === undefined || (!isOwner() && !ownsBot(human, bot)))
      throw new TeamError('bot-not-found');
    return bot;
  };
  return {
    async engineSelection(payload) {
      const parsed = selectionRequest.safeParse(payload);
      if (!parsed.success) return invalidInput('Invalid subscription engine request');
      const input = parsed.data;
      try {
        if (!host)
          throw new EngineRefusal('engine-unavailable', 'Subscription Engines are unavailable');
        if (input.action === 'status' || input.action === 'models') {
          if (input.engine !== undefined && localSubscriptionEngines !== false)
            requireGrant(input.engine === 'codex' ? engineAccountKey('codex') : input.engine);
          const account = input.engine === undefined ? undefined : host.target(input.engine);
          if (input.action === 'models' && account !== undefined) {
            const models = await host.models(account.engine, account.id);
            requireGrant(account.id);
            return { ok: true, value: { engine: account.engine, models } };
          }
          const engines = await host.status(account?.id, engineAccountFilter(team, human));
          const allowed = engineAccountFilter(team, human);
          const owner = isOwner();
          const selections = host.store.selections().filter((selection) => {
            const id = engineAccountKey(selection.engine, selection.accountId);
            const bot = registry.get(selection.botSlug);
            return (
              localSubscriptionEngines !== false &&
              (account === undefined || account.id === id) &&
              allowed(id) &&
              bot !== undefined &&
              (owner || ownsBot(human, bot))
            );
          });
          return {
            ok: true,
            value: {
              engines: engines.filter((engine) =>
                allowed(engineAccountKey(engine.engine, engine.accountId)),
              ),
              selections,
            },
          };
        }
        const { bot, role, engine, accountId, model, effort, fallback } = input;
        if (human.caller === 'bot')
          throw new TeamError('permission-required', undefined, { permission: 'models.use' });
        matchingBot(bot);
        team?.roles.require(human, 'models.use');
        if (
          (engine === null &&
            (accountId !== undefined ||
              model !== undefined ||
              effort !== undefined ||
              fallback === true)) ||
          (role === 'assignment' && fallback !== undefined)
        )
          return invalidInput('Invalid subscription engine choice');
        const choice = {
          ...(accountId === undefined ? {} : { accountId }),
          ...(model === undefined ? {} : { model }),
          ...(effort === undefined ? {} : { effort }),
        };
        if (engine !== null) {
          if (localSubscriptionEngines === false)
            throw new EngineRefusal(
              'engine-unavailable',
              'Subscription Engines run only on a local Host',
            );
          const id = engineAccountKey(engine, accountId);
          const authorize = () => {
            team?.roles.require(human, 'models.use');
            requireGrant(id);
            requireBotEngineAccount(team, matchingBot(bot), id);
          };
          authorize();
          if (model !== undefined || effort !== undefined) {
            await host.validateChoice(engine, choice);
            authorize();
          }
        }
        host.use(bot, role, engine, { fallback: fallback === true, ...choice });
        if (role === 'orchestrator') releaseEngineQuotaHold?.(bot);
        return {
          ok: true,
          value: {
            bot,
            role,
            engine,
            ...(engine === null
              ? {}
              : role === 'orchestrator'
                ? { fallback: fallback === true, ...choice }
                : choice),
          },
        };
      } catch (error) {
        return modelFailure(error);
      }
    },
  };
}
