import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { seededBannerRecipe } from '@botharness/pixel-banner';

import type {
  MarketplaceDigestPick,
  MarketplaceEntry,
} from '../../../core/src/marketplace/client.js';
import type { MarketplaceLanguage } from '../../../core/src/marketplace/language.js';
import { PersonaBotAvatar } from './avatar.js';
import { BotBannerArt, bannerOf } from './bot-banner.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export type DigestCoverLayout = 'date' | 'one' | 'two' | 'three' | 'four';

const LAYOUTS: readonly DigestCoverLayout[] = ['date', 'one', 'two', 'three', 'four'];

const BOTTOM_ROW: Record<DigestCoverLayout, readonly number[]> = {
  date: [],
  one: [0],
  two: [0, 1],
  three: [0, 2],
  four: [2, 3],
};

export function digestCoverLayout(picks: number): DigestCoverLayout {
  return LAYOUTS[Math.min(Math.max(picks, 0), 4)] ?? 'date';
}

export function digestPickOf(bot: MarketplaceEntry): MarketplaceDigestPick {
  return {
    id: bot.id,
    displayName: bot.displayName ?? bot.name,
    banner: bot.banner,
    avatar: bot.avatar,
  };
}

export function digestShortDate(day: string, lang: MarketplaceLanguage): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) return day;
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(at);
}

const styles = stylex.create({
  cover: {
    position: 'relative',
    display: 'grid',
    gap: space.x1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: color.hover,
    isolation: 'isolate',
  },
  date: { gridTemplate: '1fr / 1fr' },
  one: { gridTemplate: '1fr / 1fr' },
  two: { gridTemplate: '1fr / 1fr 1fr' },
  three: { gridTemplate: '1fr 1fr / 2fr 1fr' },
  four: { gridTemplate: '1fr 1fr / 1fr 1fr' },
  lead: { gridRow: '1 / span 2' },
  tile: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: color.surface,
  },
  art: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    imageRendering: 'pixelated',
  },
  avatar: {
    position: 'absolute',
    insetInlineStart: space.x3,
    insetBlockEnd: space.x3,
    display: 'block',
    padding: space.x1,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    lineHeight: 0,
  },
  avatarRaised: { insetBlockEnd: '64px' },
  shade: {
    position: 'absolute',
    insetInline: 0,
    insetBlockEnd: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingTop: space.x6,
    paddingInline: space.x4,
    paddingBottom: space.x4,
    backgroundImage: `linear-gradient(to top, ${color.surface} 30%, color-mix(in srgb, ${color.surface} 80%, transparent) 65%, transparent)`,
    color: color.fg,
    textAlign: 'start',
    pointerEvents: 'none',
  },
  eyebrow: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  title: {
    display: '-webkit-box',
    overflow: 'hidden',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
});

function CoverTile({
  pick,
  lead,
  avatarSize,
  raised,
  t,
}: {
  pick: MarketplaceDigestPick;
  lead: boolean;
  avatarSize: number;
  raised: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const name = pick.displayName ?? pick.id;
  const avatar = pick.avatar;
  return (
    <span {...stylex.props(styles.tile, lead && styles.lead)} data-digest-cover-pick={pick.id}>
      <BotBannerArt
        banner={bannerOf(pick.banner ?? undefined, name)}
        className={stylex.props(styles.art).className ?? ''}
      />
      <span {...stylex.props(styles.avatar, raised && styles.avatarRaised)} aria-hidden="true">
        <PersonaBotAvatar
          personaBotId=""
          name={name}
          src={avatar !== null && 'image' in avatar ? avatar.image : undefined}
          appearance={
            avatar !== null && 'recipe' in avatar
              ? { recipe: avatar.recipe, revision: '0'.repeat(64) }
              : undefined
          }
          size={avatarSize}
          indicator={false}
          still
          t={t}
        />
      </span>
    </span>
  );
}

export function DigestCover({
  day,
  title,
  picks,
  lang,
  t,
  avatarSize = 28,
  caption = true,
}: {
  day: string;
  title: string;
  picks: readonly MarketplaceDigestPick[];
  lang: MarketplaceLanguage;
  t: BotHarnessTranslate;
  avatarSize?: number;
  caption?: boolean;
}): ReactElement {
  const layout = digestCoverLayout(picks.length);
  const shown = picks.slice(0, 4);
  return (
    <span {...stylex.props(styles.cover, styles[layout])} data-digest-cover={layout}>
      {layout === 'date' ? (
        <span {...stylex.props(styles.tile)}>
          <BotBannerArt
            banner={{ recipe: seededBannerRecipe(`digest:${day}`) }}
            className={stylex.props(styles.art).className ?? ''}
          />
        </span>
      ) : (
        shown.map((pick, index) => (
          <CoverTile
            key={pick.id}
            pick={pick}
            lead={layout === 'three' && index === 0}
            avatarSize={avatarSize}
            raised={caption && BOTTOM_ROW[layout].includes(index)}
            t={t}
          />
        ))
      )}
      {caption ? (
        <span {...stylex.props(styles.shade)}>
          <span {...stylex.props(styles.eyebrow)}>
            {t('market.digest.label')} · {digestShortDate(day, lang)}
          </span>
          <span {...stylex.props(styles.title)}>{title}</span>
        </span>
      ) : null}
    </span>
  );
}
