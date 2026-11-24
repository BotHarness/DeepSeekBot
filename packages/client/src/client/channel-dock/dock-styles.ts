import * as stylex from '@stylexjs/stylex';
import { type DockviewTheme } from 'dockview-react';
import { border, space, color, radius, size, text } from '../ds/tokens.stylex.js';

export const styles = stylex.create({
  sessionChips: { display: 'inline-flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  storageWarning: {
    position: 'absolute',
    bottom: space.x4,
    insetInlineStart: space.x4,
    insetInlineEnd: space.x4,
    zIndex: 50,
    padding: space.x3,
    backgroundColor: color.surface,
    color: color.fg,
    borderRadius: radius.sm,
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    overflow: 'auto',
    paddingTop: space.x1,
    paddingInline: space.x4,
    paddingBottom: space.x4,
  },
  flushBody: { paddingTop: 0, paddingBottom: 0, paddingInline: 0 },
  workspaceBody: { paddingTop: space.x1, paddingBottom: space.x1, paddingInline: space.x1 },
  panel: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  channelName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
  },
  breadcrumbIcon: { display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
  info: { display: 'inline-flex', alignItems: 'center', minWidth: 0, marginInlineStart: space.x2 },
  identity: { display: 'inline-flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  identityButton: {
    gap: space.x3,
    height: size.row,
    paddingBlock: 0,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: 'inherit',
    fontFamily: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  actions: { display: 'inline-flex', alignItems: 'center', minWidth: 0, gap: space.x1 },
});

export const DOCK_DND_EDGES = {
  size: { value: 24, type: 'pixels' },
  activationSize: { value: 8, type: 'percentage' },
} as const;

export const DOCK_THEME: DockviewTheme = {
  name: 'botharness',
  className: 'bh-dock-theme',
  gap: 0,
  dndOverlayMounting: 'relative',
  dndPanelOverlay: 'content',
};

export const SUBPANEL_DROP_TYPE = 'application/x-bh-subpanel';
