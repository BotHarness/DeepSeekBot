import type { ReactElement } from 'react';
import type { MarketplaceEntry, MarketplaceLanguage } from './marketplace.js';
import type { BotHarnessTranslate } from './locale.js';
import { PersonaBotAvatar } from './avatar.js';
import { BotBannerArt } from './bot-banner.js';
import { formatStars } from './community-links.js';
import { Tag } from './ds/tag.js';
import { formatRelativeTime } from './labels.js';

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function marketplaceName(bot: MarketplaceEntry): string {
  return bot.displayName ?? bot.name;
}

export function marketplaceOwner(bot: MarketplaceEntry): string {
  if (bot.source === 'upload' && bot.author !== null) return `${bot.author.name} #${bot.author.id}`;
  return bot.displayName === null ? bot.owner : bot.fullName;
}

export function MarketplaceOwner({ bot }: { bot: MarketplaceEntry }): ReactElement {
  const avatar = bot.source === 'upload' ? bot.author?.avatar : null;
  return (
    <>
      {avatar == null ? null : (
        <img className="bh-market-author-avatar" src={avatar} alt="" data-market-author-avatar="" />
      )}
      {marketplaceOwner(bot)}
    </>
  );
}

export function MarketplaceName({ bot }: { bot: MarketplaceEntry }): ReactElement {
  return (
    <span className="bh-market-name">
      <span>{marketplaceName(bot)}</span>
      <span className="bh-market-owner">
        <MarketplaceOwner bot={bot} />
      </span>
      {bot.roles.map((role) => (
        <Tag key={role} tone="outline">
          {role}
        </Tag>
      ))}
    </span>
  );
}

export function MarketplaceDescription({
  bot,
  t,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <span className="bh-market-description">
      {bot.description}
      {bot.descriptionGenerated === true ? (
        <span className="bh-market-generated" title={t('market.descriptionGenerated')}>
          {t('market.descriptionGeneratedTag')}
        </span>
      ) : null}
    </span>
  );
}

export function day(value: string): string {
  return value.slice(0, 10);
}

function ago(value: string, t: BotHarnessTranslate): string {
  const at = Date.parse(value);
  return Number.isNaN(at) ? day(value) : formatRelativeTime(at, Date.now(), t);
}

export function marketplaceLanguage(t: BotHarnessTranslate): MarketplaceLanguage {
  return t('market.language') === 'en' ? 'en' : 'zh';
}

export function MarketplaceInstalls({
  bot,
  t,
  className = 'bh-market-installs',
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  className?: string;
}): ReactElement {
  return (
    <span
      className={className}
      data-market-installs={bot.installs}
      aria-label={t('market.installs', { count: String(bot.installs) })}
      title={t('market.installs', { count: String(bot.installs) })}
    >
      {t('market.installsCount', {
        count: formatStars(bot.installs, marketplaceLanguage(t)),
      })}
    </span>
  );
}

export function MarketplaceMeta({
  bot,
  t,
  topics = true,
  created = false,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  topics?: boolean;
  created?: boolean;
}): ReactElement {
  return (
    <span className="bh-market-meta">
      {bot.source === 'upload' ? null : (
        <span>{t('market.stars', { count: String(bot.stars) })}</span>
      )}
      <MarketplaceInstalls bot={bot} t={t} />
      {bot.installed?.authorUpdated === true ? (
        <span data-market-author-updated="">
          <Tag tone="info">{t('market.authorUpdated')}</Tag>
        </span>
      ) : null}
      {created && bot.createdAt !== undefined ? (
        <span title={day(bot.createdAt)}>
          {t('market.created', { date: ago(bot.createdAt, t) })}
        </span>
      ) : (
        <span title={day(bot.pushedAt)}>{t('market.updated', { date: ago(bot.pushedAt, t) })}</span>
      )}
      {(topics ? bot.topics : []).map((topic) => (
        <Tag key={topic} tone="neutral">
          {topic}
        </Tag>
      ))}
    </span>
  );
}

export function MarketplaceAvatar({
  bot,
  size,
  t,
}: {
  bot: MarketplaceEntry;
  size: number;
  t: BotHarnessTranslate;
}): ReactElement {
  const avatar = bot.avatar;
  return (
    <span
      className="bh-market-avatar"
      aria-hidden="true"
      data-market-avatar={avatar === null ? 'seeded' : 'recipe' in avatar ? 'recipe' : 'image'}
    >
      <PersonaBotAvatar
        personaBotId=""
        name={marketplaceName(bot)}
        src={avatar !== null && 'image' in avatar ? avatar.image : undefined}
        appearance={
          avatar !== null && 'recipe' in avatar
            ? { recipe: avatar.recipe, revision: '0'.repeat(64) }
            : undefined
        }
        size={size}
        indicator={false}
        still
        t={t}
      />
    </span>
  );
}

export function MarketplaceBanner({
  bot,
  className,
}: {
  bot: MarketplaceEntry;
  className: string;
}): ReactElement {
  return (
    <span className={className} data-market-banner={bot.banner === null ? 'none' : 'shown'}>
      {bot.banner === null ? null : <BotBannerArt banner={bot.banner} />}
    </span>
  );
}
