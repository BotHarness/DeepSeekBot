import type { MarketplaceDetail } from '../../../../packages/core/src/marketplace/client';
import type { createBotCreationController } from '../host/bot-creation';

export async function selectMarketplaceImport(
  controller: ReturnType<typeof createBotCreationController>,
  detail: MarketplaceDetail,
  entry: { kind: 'all' } | { kind: 'host'; hostId: string } | { kind: 'refresh' },
): Promise<string | undefined> {
  if (!detail.commitSha || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(detail.commitSha))
    return 'marketplace-version-unavailable';
  await controller.ready;
  let current = controller.getSnapshot();
  if (current.busy) return 'creation-pending';
  if (current.record.kind === 'submitted' && current.record.acknowledged) {
    await controller.another('', 'fresh');
    current = controller.getSnapshot();
    if (current.error) return current.error;
  }
  if (current.record.kind !== 'draft') return 'creation-pending';
  const source = current.record.draft.source;
  if (
    entry.kind !== 'refresh' ||
    source?.kind !== 'git' ||
    source.origin !== 'marketplace' ||
    source.listingId !== detail.bot.id
  ) {
    await controller.enter(entry.kind === 'refresh' ? { kind: 'all' } : entry);
    if (controller.getSnapshot().error) return controller.getSnapshot().error;
  }
  await controller.beginImport({
    gitUrl: detail.bot.cloneUrl,
    displayName: detail.bot.displayName ?? detail.bot.name,
    description: detail.bot.description ?? '',
    roles: detail.bot.roles,
    origin: 'marketplace',
    listingId: detail.bot.id,
    expectedCommit: detail.commitSha,
  });
  const next = controller.getSnapshot();
  if (next.error) return next.error;
  return next.record.kind === 'draft' &&
    next.record.draft.source?.kind === 'git' &&
    next.record.draft.source.listingId === detail.bot.id
    ? undefined
    : 'creation-pending';
}
