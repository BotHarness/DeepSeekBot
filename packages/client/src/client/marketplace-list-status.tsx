import type { ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';
import type { MarketplaceBrowse } from './marketplace.js';
import { Button } from './ds/button.js';
import { ReadFailure } from './ds/read-failure.js';
import { marketplaceError } from './marketplace-feedback.js';

export function MarketplaceListStatus({
  browse,
  t,
}: {
  browse: MarketplaceBrowse;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const { list, filters } = browse;
  if (list.status === 'loading') {
    return (
      <div className="bh-market-state" role="status">
        {t('market.loading')}
      </div>
    );
  }
  if (list.status === 'error') {
    return (
      <ReadFailure retryLabel={t('market.retry')} onRetry={browse.retry}>
        {t('market.error.load', { error: marketplaceError(list.cause, t) })}
      </ReadFailure>
    );
  }
  if (list.bots.length > 0) return null;
  return (
    <div className="bh-market-state">
      {filters.query.length > 0 || filters.topic !== undefined
        ? t('market.search.empty')
        : t('market.empty')}
    </div>
  );
}

export function MarketplaceLoadMore({
  browse,
  t,
}: {
  browse: MarketplaceBrowse;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const { list } = browse;
  if (list.status !== 'ready' || list.nextCursor === undefined) return null;
  return (
    <Button variant="outline" disabled={list.loadingMore} onClick={browse.loadMore}>
      {list.loadingMore ? t('market.loadingMore') : t('market.loadMore')}
    </Button>
  );
}
