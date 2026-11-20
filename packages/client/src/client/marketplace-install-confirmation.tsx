import type { ReactElement } from 'react';
import type { MarketplaceEntry } from './marketplace.js';
import type { BotHarnessTranslate } from './locale.js';
import { PersonaBotAvatar } from './avatar.js';
import { personaBotCreateError } from './persona-bot-create.js';
import {
  day,
  MarketplaceDescription,
  MarketplaceName,
  marketplaceName,
  MarketplaceOwner,
  shortSha,
} from './marketplace-listing.js';

export function InstallConfirmation({
  bot,
  t,
  reviewView,
  cause,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  reviewView: ReactElement;
  cause: unknown | undefined;
}): ReactElement {
  return (
    <div className="bh-market-confirm">
      <div className="bh-market-confirm-head">
        <PersonaBotAvatar
          personaBotId=""
          name={marketplaceName(bot)}
          size={44}
          indicator={false}
          t={t}
        />
        <span className="bh-market-copy">
          <MarketplaceName bot={bot} />
          {bot.description === null ? null : <MarketplaceDescription bot={bot} t={t} />}
        </span>
      </div>
      {bot.source === 'upload' ? (
        <dl className="bh-market-facts">
          <div>
            <dt>{t('market.confirm.author')}</dt>
            <dd data-market-author>
              <MarketplaceOwner bot={bot} />
            </dd>
          </div>
          <div>
            <dt>{t('market.confirm.uploaded')}</dt>
            <dd>{day(bot.pushedAt)}</dd>
          </div>
        </dl>
      ) : (
        <dl className="bh-market-facts">
          <div>
            <dt>{t('market.confirm.source')}</dt>
            <dd>
              <a href={bot.htmlUrl} target="_blank" rel="noreferrer">
                {bot.fullName}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t('market.confirm.commit')}</dt>
            <dd data-market-commit>
              {bot.headCommit === null
                ? t('market.confirm.noCommit')
                : t('market.confirm.commitValue', {
                    sha: shortSha(bot.headCommit.sha),
                    date: day(bot.headCommit.committedAt),
                  })}
            </dd>
          </div>
        </dl>
      )}
      {reviewView}
      {cause === undefined ? null : (
        <div className="bh-modal-error" role="alert">
          {t('market.install.failed', {
            error: personaBotCreateError(cause, t),
          })}
        </div>
      )}
    </div>
  );
}
