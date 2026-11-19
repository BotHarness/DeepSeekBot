import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Button } from './button.js';
import { dimension } from './dimensions.stylex.js';
import { hooked } from './hooked.js';
import { Icon } from './icon.js';
import { surfaceStyles } from './surface.js';
import { elevation, ink, layer, radius, space, style, type } from './tobs.stylex.js';

export const profileStyles = stylex.create({
  view: {
    position: 'relative',
    zIndex: 1,
    flexGrow: 1,
    minHeight: 0,
    overflow: 'auto',
    paddingBlock: space.x5,
    paddingInline: space.x5,
  },
  back: { marginBottom: space.x4, paddingInline: space.x3, color: ink.secondary },
  bannerCard: {
    overflow: 'hidden',
    marginBottom: space.x5,
    borderRadius: style.radiusCard,
    backgroundColor: layer.raised,
    minWidth: 0,
  },
  banner: {
    position: 'relative',
    aspectRatio: '3 / 1',
    maxHeight: dimension.profileBannerMaxHeight,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: layer.well,
  },
  bannerEdit: {
    position: 'absolute',
    insetBlockStart: space.x3,
    insetInlineEnd: space.x3,
    borderRadius: radius.full,
    backgroundColor: layer.raised,
    boxShadow: elevation.x1,
  },
  headerBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    paddingBlockEnd: space.x5,
    paddingInline: space.x5,
    minWidth: 0,
  },
  headerTop: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.x3,
    marginBlockStart: `calc(-1 * ${dimension.profileAvatarOverlap})`,
  },
  avatar: {
    position: 'relative',
    width: dimension.profileAvatarSize,
    height: dimension.profileAvatarSize,
    padding: 0,
    borderRadius: radius.lg,
    boxShadow: elevation.x1,
    opacity: { ':disabled': 1 },
  },
  avatarBadge: {
    position: 'absolute',
    insetBlockEnd: 0,
    insetInlineEnd: 0,
    display: 'grid',
    placeItems: 'center',
    width: style.controlHeight,
    height: style.controlHeight,
    borderRadius: radius.full,
    backgroundColor: layer.raised,
    color: ink.primary,
    boxShadow: elevation.x1,
    pointerEvents: 'none',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.x2,
    marginInlineStart: 'auto',
    paddingBlockEnd: space.x2,
  },
  title: {
    margin: 0,
    color: ink.primary,
    fontSize: type.headingSize,
    lineHeight: type.headingLine,
    fontWeight: type.headingWeight,
    overflowWrap: 'anywhere',
  },
  caption: {
    margin: 0,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    overflowWrap: 'anywhere',
  },
  groupIdentity: { display: 'flex', alignItems: 'flex-start', gap: space.x4 },
  groupHeading: { display: 'grid', gap: space.x2, minWidth: 0 },
  bio: {
    margin: 0,
    color: ink.secondary,
    fontSize: type.bodySize,
    lineHeight: type.bodyLine,
    overflowWrap: 'anywhere',
  },
  tags: { display: 'inline-flex', flexWrap: 'wrap', gap: space.x2 },
  activity: { display: 'grid', gap: space.x4, marginBlockStart: space.x5 },
  activityTitle: {
    margin: 0,
    color: ink.primary,
    fontWeight: type.titleWeight,
    fontSize: type.titleSize,
    lineHeight: type.titleLine,
  },
  cards: { display: 'grid', gap: space.x4, minWidth: 0 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: space.x3,
    padding: space.x4,
    borderRadius: style.radiusCard,
    backgroundColor: layer.raised,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.x3,
  },
  cardLabel: { display: 'inline-flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
});

export function ProfilePanel({
  backLabel,
  onClose,
  children,
}: {
  backLabel: string;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div {...hooked('bh-profile-view', profileStyles.view)}>
      <Button
        size="sm"
        className="bh-profile-back"
        icon={<Icon name="chevron-left" />}
        variant="ghost"
        xstyle={profileStyles.back}
        onClick={onClose}
      >
        {backLabel}
      </Button>
      {children}
    </div>
  );
}

export function ProfileActivitySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={title} {...hooked('bh-profile-section', profileStyles.activity)}>
      <h2 {...stylex.props(profileStyles.activityTitle)}>{title}</h2>
      <div {...stylex.props(profileStyles.cards)}>{children}</div>
    </section>
  );
}

export function ProfileCard({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section {...hooked('bh-profile-card', profileStyles.card, surfaceStyles.card)}>
      <header {...hooked('bh-profile-card-head', profileStyles.cardHead)}>
        <span {...hooked('bh-profile-card-label', profileStyles.cardLabel)}>{label}</span>
      </header>
      {children}
    </section>
  );
}
