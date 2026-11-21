import type { MarketplaceAvatarApplyCandidate } from '@botharness/host-protocol/marketplace-avatar';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import { isAvatarAppearance } from '../../bots/avatar-appearance.js';
import { personaBotAvatarFromBytes, type PersonaBotRecord } from '../../bots/persona-bot.js';
import {
  asNonBlank,
  asObject,
  invalidInput,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import { writeBotAvatar } from '../avatars/methods.js';
import type { HumanContext } from '../../humans/context.js';
import { ownsBot } from '../../team/bot-access.js';
import type { MarketplaceClient, MarketplaceResult } from '../../marketplace/client.js';

type ApplyResult = BridgeResult<{ applied: true }>;
const MAX_OPERATION_KEYS = 128;
const botNotFound = (): ApplyResult => ({
  ok: false,
  error: { code: 'bot-not-found', message: 'Bot unavailable' },
});

export function createMarketplaceAvatarApply(
  human: HumanContext,
  deps: Pick<BridgeMethodsDeps, 'team' | 'registry' | 'marketplaceReceipts'>,
  isHostOwner: () => boolean,
  marketplaceCall: <T>(
    operation: (client: MarketplaceClient) => Promise<MarketplaceResult<T>>,
  ) => Promise<BridgeResult<T>>,
) {
  const { registry, team } = deps;
  const operations = new Map<
    string,
    { id: string; slug: string; createdAt: string; result: Promise<ApplyResult> }
  >();
  const canManageAll = () =>
    human.caller !== 'bot' &&
    (isHostOwner() || (team?.roles.permissions(human).includes('bots.manageAll') ?? false));
  const active = () =>
    isHostOwner() || team === undefined || team.member(human.humanId)?.status === 'active';
  const allowed = (bot: PersonaBotRecord) => active() && (ownsBot(human, bot) || canManageAll());
  const apply = async (id: string, target: PersonaBotRecord): Promise<ApplyResult> => {
    const image = await marketplaceCall((client) => client.avatarImage(id));
    if (!image.ok) {
      return image.error.code === 'avatar-not-found'
        ? { ok: false, error: { ...image.error, message: 'This Avatar is no longer available.' } }
        : image;
    }
    const avatar = personaBotAvatarFromBytes(image.value);
    if (avatar === undefined)
      return {
        ok: false,
        error: { code: 'unprocessed-image', message: 'Invalid Marketplace Avatar image' },
      };
    const bot = registry.get(target.slug);
    if (bot === undefined || bot.createdAt !== target.createdAt || !allowed(bot))
      return botNotFound();
    if (!ownsBot(human, bot)) team?.privateAccess.recordBotAction(human, bot, 'botAvatarSet');
    const saved = writeBotAvatar(registry, bot.slug, avatar);
    if (!saved.ok) return saved;
    void Promise.resolve()
      .then(() => deps.marketplaceReceipts?.sendAvatar?.(id, saved.value.slug))
      .catch(() => undefined);
    return { ok: true, value: { applied: true } };
  };

  return {
    marketplaceAvatarApplyCandidates(): BridgeResult<{ bots: MarketplaceAvatarApplyCandidate[] }> {
      const bots = registry
        .list(canManageAll() ? undefined : human.humanId)
        .filter(allowed)
        .map((bot): MarketplaceAvatarApplyCandidate => ({
          slug: bot.slug,
          displayName: bot.displayName,
          ...(bot.avatar === undefined ||
          (!ownsBot(human, bot) && !isHostOwner() && !team?.bots.canReach(human, bot.slug))
            ? {}
            : {
                avatar: bot.avatar.startsWith('data:image/')
                  ? botAvatarUrl(bot.slug, bot.avatar)
                  : bot.avatar,
              }),
          ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
          hasAppearance: isAvatarAppearance(bot.appearance),
        }));
      return { ok: true, value: { bots } };
    },
    async marketplaceAvatarApply(payload: unknown): Promise<ApplyResult> {
      const input = asObject(payload);
      const { id, operationKey } = input;
      const slug = asNonBlank(input, 'bot');
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id) || slug === undefined)
        return invalidInput('Avatar ID and target Bot are required');
      if (
        operationKey !== undefined &&
        (typeof operationKey !== 'string' || !operationKey.trim() || operationKey.length > 256)
      )
        return invalidInput('invalid operationKey');

      const bot = registry.get(slug);
      if (bot === undefined || !allowed(bot)) return botNotFound();
      if (operationKey === undefined) return apply(id, bot);
      const existing = operations.get(operationKey);
      if (existing !== undefined)
        return existing.id === id && existing.slug === slug && existing.createdAt === bot.createdAt
          ? existing.result
          : invalidInput('operationKey was used for a different apply');

      const result = apply(id, bot).then(
        (reply) => {
          if (!reply.ok && operations.get(operationKey)?.result === result)
            operations.delete(operationKey);
          return reply;
        },
        (error: unknown) => {
          if (operations.get(operationKey)?.result === result) operations.delete(operationKey);
          throw error;
        },
      );
      if (operations.size >= MAX_OPERATION_KEYS) {
        const oldest = operations.keys().next();
        if (!oldest.done) operations.delete(oldest.value);
      }
      operations.set(operationKey, { id, slug, createdAt: bot.createdAt, result });
      return result;
    },
  };
}
