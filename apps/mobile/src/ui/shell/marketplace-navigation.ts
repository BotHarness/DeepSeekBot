import { router } from 'expo-router';
import type {
  MarketplaceEntry,
  MarketplaceInstallSource,
  MarketplaceSectionName,
} from '../../../../../packages/core/src/marketplace/client';
import { botCreation } from '../../host/native-bot-creation';
import { selectMarketplaceImport } from '../../marketplace/import-selection';
import { marketplace } from '../../marketplace/native-catalogue';
import { recordFeature } from '../../telemetry/features';
import { locale } from '../strings';

export type MarketplaceTarget = { entry: 'host'; hostId: string } | { entry: 'all' };

export function marketplaceTarget(params: {
  entry?: string | undefined;
  hostId?: string | undefined;
}): MarketplaceTarget {
  return params.entry === 'host' && params.hostId
    ? { entry: 'host', hostId: params.hostId }
    : { entry: 'all' };
}

export function openMarketplaceBot(
  bot: MarketplaceEntry,
  target: MarketplaceTarget,
  source: MarketplaceInstallSource,
): void {
  recordFeature('marketplace:bot_open', { entry: source, step: 'detail' });
  router.push({ pathname: '/marketplace-bot', params: { id: bot.id, ...target } });
}

export async function importMarketplaceBot(
  bot: MarketplaceEntry,
  target: MarketplaceTarget,
  source: MarketplaceInstallSource,
): Promise<void> {
  recordFeature('marketplace:bot_open', { entry: source, step: 'install' });
  const resource = marketplace.detail(bot.id, locale);
  await resource.refresh();
  const loaded = resource.getSnapshot();
  const error =
    loaded.value && !loaded.error
      ? await selectMarketplaceImport(
          botCreation,
          loaded.value,
          target.entry === 'host' ? { kind: 'host', hostId: target.hostId } : { kind: 'all' },
        )
      : undefined;
  if (loaded.value && !loaded.error && !error)
    router.push({ pathname: '/create-bot', params: { entry: 'resume' } });
  else
    router.push({
      pathname: '/marketplace-bot',
      params: { id: bot.id, ...target, ...(error ? { error } : {}) },
    });
}

export function openDigest(day: string, from: 'hero' | 'archive', target: MarketplaceTarget) {
  recordFeature('marketplace:digest_open', { entry: from });
  router.push({ pathname: '/marketplace-digest', params: { day, ...target } });
}

export function openPastPicks(target: MarketplaceTarget) {
  recordFeature('marketplace:digest_archive_open', {});
  router.push({ pathname: '/marketplace-past-picks', params: { ...target } });
}

export function openRanking(section: MarketplaceSectionName, target: MarketplaceTarget) {
  router.push({ pathname: '/marketplace-ranking', params: { section, ...target } });
}
