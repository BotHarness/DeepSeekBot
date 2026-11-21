import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { MethodRefused, type HostClient } from '@botharness/host-client/client';
import {
  loadMarketplaceChallenge,
  marketplaceAvatarActions,
} from '@botharness/host-client/marketplace-avatars';
import type {
  MarketplaceAvatar,
  MarketplaceAvatarPage,
  MarketplaceAvatarQuery,
} from '@botharness/host-protocol/marketplace-avatar';
import { encodeSolution } from '../../../../packages/core/src/marketplace/altcha';
import { cached, resource, type CatalogueResource } from './catalogue';

function read<T>(load: () => Promise<T>) {
  return async () => {
    try {
      return { ok: true as const, value: await load() };
    } catch (error) {
      return {
        ok: false as const,
        code: error instanceof MethodRefused ? error.code : 'marketplace-unavailable',
      };
    }
  };
}

type AvatarList = CatalogueResource<MarketplaceAvatarPage> & { more(): Promise<void> };

function createMarketplaceAvatars(client: Pick<HostClient, 'call' | 'refresh' | 'resource'>) {
  const lists = new Map<string, AvatarList>();
  const details = new Map<string, CatalogueResource<MarketplaceAvatar>>();
  const host = marketplaceAvatarActions(client);
  return {
    list(query: Omit<MarketplaceAvatarQuery, 'cursor'>): AvatarList {
      return cached(lists, JSON.stringify(query), () => {
        const list = resource(read(() => host.marketplaceAvatarList(query)));
        return {
          subscribe: list.subscribe,
          getSnapshot: list.getSnapshot,
          refresh: list.refresh,
          more() {
            const previous = list.getSnapshot().value;
            const cursor = previous?.nextCursor;
            if (previous === undefined || cursor == null) return Promise.resolve();
            return list.run(
              read(async () => {
                const next = await host.marketplaceAvatarList({ ...query, cursor });
                if (next.nextCursor === cursor) throw new Error('unchanged-cursor');
                const avatars = new Map(previous.avatars.map((avatar) => [avatar.id, avatar]));
                for (const avatar of next.avatars) avatars.set(avatar.id, avatar);
                return { avatars: [...avatars.values()], nextCursor: next.nextCursor };
              }),
              'more',
            );
          },
        };
      });
    },
    tags: resource(
      read(async () => {
        const tags = await host.marketplaceAvatarTags();
        return tags.map(({ tag, count }) => ({ topic: tag, count }));
      }),
    ),
    detail(id: string) {
      return cached(details, id, () => resource(read(() => host.marketplaceAvatarDetail(id))));
    },
    avatarResource: client.resource,
    candidates: resource(
      read(async () => {
        const { bots } = await host.marketplaceAvatarApplyCandidates();
        return bots;
      }),
    ),
    async apply(id: string, bot: string) {
      await host.marketplaceAvatarApply(id, bot);
      await client.refresh().catch(() => undefined);
    },
    account: resource(read(host.marketplaceAccount)),
    saveAuthor: (displayName: string) => host.marketplaceAuthorSave(displayName, true),
    source: host.marketplaceAvatarSource,
    publish: host.marketplaceAvatarPublish,
    mine: resource(read(async () => (await host.marketplaceAvatarMine()).avatars)),
    edit: host.marketplaceAvatarEdit,
    remove: host.marketplaceAvatarDelete,
    async report(id: string, reason: string, signal: AbortSignal) {
      const challenge = await loadMarketplaceChallenge(client);
      const { salt, maxnumber, ...proof } = challenge;
      const batch = 64;
      for (let start = 0; start <= maxnumber && !signal.aborted; start += batch) {
        const hashes = await Promise.all(
          Array.from({ length: Math.min(batch, maxnumber - start + 1) }, (_, offset) =>
            digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}${start + offset}`),
          ),
        );
        const index = hashes.indexOf(challenge.challenge);
        if (index < 0) continue;
        if (signal.aborted) return;
        const altcha = encodeSolution({ ...proof, salt, number: start + index });
        await host.marketplaceAvatarReport(id, altcha, reason || undefined);
        return;
      }
      if (!signal.aborted) throw new Error('challenge-unsolved');
    },
  };
}

export type MarketplaceAvatars = ReturnType<typeof createMarketplaceAvatars>;

const byHost = new WeakMap<HostClient, MarketplaceAvatars>();
export function marketplaceAvatars(client: HostClient): MarketplaceAvatars {
  const avatars = byHost.get(client) ?? createMarketplaceAvatars(client);
  byHost.set(client, avatars);
  return avatars;
}
