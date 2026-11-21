import {
  asObject,
  asSlug,
  invalidInput,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { TakeoverError, type TakeoverHandoff } from '../../takeover/contracts.js';
import { dmChannelId } from '../../channels/channel.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';

function takeoverFailure(error: unknown): BridgeResult<never> {
  if (error instanceof TakeoverError)
    return { ok: false, error: { code: error.code, message: error.message } };
  return invalidInput(String(error));
}

function takeoverSurface(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/u.test(value) ? value : 'client';
}

export interface TakeoverAdapterMethods {
  takeoverList(payload: unknown): BridgeResult<{ takeovers: TakeoverHandoff[] }>;
  takeoverStatus(payload: unknown): BridgeResult<{ takeover: TakeoverHandoff }>;
  takeoverRequest(payload: unknown): Promise<BridgeResult<{ takeover: TakeoverHandoff }>>;
  takeoverComplete(payload: unknown): Promise<BridgeResult<{ takeover: TakeoverHandoff }>>;
  takeoverCancel(payload: unknown): Promise<BridgeResult<{ takeover: TakeoverHandoff }>>;
}

export function createTakeoverAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
): TakeoverAdapterMethods {
  return {
    takeoverList(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      const slug = source['slug'];
      const channelId = source['channelId'];
      const limit = source['limit'];
      if (
        (slug !== undefined && typeof slug !== 'string') ||
        (channelId !== undefined && typeof channelId !== 'string') ||
        (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit))) ||
        (source['pendingOnly'] !== undefined && typeof source['pendingOnly'] !== 'boolean')
      )
        return invalidInput('slug, channelId, limit or pendingOnly has the wrong type');
      if (typeof slug === 'string' && deps.registry.get(slug) === undefined)
        return unknownBot(slug);
      try {
        return {
          ok: true,
          value: {
            takeovers: deps.takeovers.list({
              ...(slug === undefined ? {} : { botSlug: slug }),
              ...(channelId === undefined ? {} : { channelId }),
              ...(limit === undefined ? {} : { limit }),
              pendingOnly: source['pendingOnly'] === true,
            }),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
    takeoverStatus(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      if (typeof source['channelId'] !== 'string' || typeof source['messageId'] !== 'string')
        return invalidInput('channelId and messageId are required');
      const takeover = deps.takeovers.get(source['channelId'], source['messageId']);
      return takeover === undefined
        ? {
            ok: false,
            error: {
              code: 'not-found',
              message: 'No takeover request with this id',
            },
          }
        : { ok: true, value: { takeover } };
    },
    async takeoverRequest(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const bot = deps.registry.get(slug);
      if (bot === undefined) return unknownBot(slug);
      if (bot.paused === true) return invalidInput('The Bot is paused and cannot be woken');
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      const channelId = source['channelId'];
      if (channelId !== undefined && typeof channelId !== 'string')
        return invalidInput('channelId must be a string');
      try {
        return {
          ok: true,
          value: {
            takeover: await deps.takeovers.request({
              botSlug: slug,
              channelId: channelId ?? dmChannelId(slug),
              target: source['target'],
              title: source['title'],
              message: source['message'],
              ...(source['minutes'] === undefined ? {} : { minutes: source['minutes'] }),
              initiator: 'cli',
            }),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
    async takeoverComplete(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      const outcome = source['outcome'];
      if (
        typeof source['channelId'] !== 'string' ||
        typeof source['messageId'] !== 'string' ||
        (outcome !== 'done' && outcome !== 'failed')
      )
        return invalidInput('channelId, messageId and outcome done or failed are required');
      try {
        return {
          ok: true,
          value: {
            takeover: await deps.takeovers.complete(
              source['channelId'],
              source['messageId'],
              outcome,
              takeoverSurface(source['surface']),
              human,
            ),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
    async takeoverCancel(payload) {
      const source = asObject(payload);
      if (deps.takeovers === undefined) return invalidInput('Takeover handoffs are unavailable');
      if (typeof source['channelId'] !== 'string' || typeof source['messageId'] !== 'string')
        return invalidInput('channelId and messageId are required');
      try {
        return {
          ok: true,
          value: {
            takeover:
              typeof source['bot'] === 'string'
                ? await deps.takeovers.cancel(
                    source['channelId'],
                    source['messageId'],
                    'bot',
                    takeoverSurface(source['surface']),
                    source['bot'],
                  )
                : await deps.takeovers.cancel(
                    source['channelId'],
                    source['messageId'],
                    'human',
                    takeoverSurface(source['surface']),
                    undefined,
                    human,
                  ),
          },
        };
      } catch (error) {
        return takeoverFailure(error);
      }
    },
  };
}
