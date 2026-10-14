import * as stylex from '@stylexjs/stylex';

import { border, color, radius, space, text } from './ds/tokens.stylex.js';

export const COMPANION_FONT = 'var(--dsw-font-markdown-code-block-font-family)';
export const COMPANION_RAISED = `color-mix(in srgb, ${color.fg} 4%, ${color.base})`;
const SHADOW = `color-mix(in srgb, ${color.fg} 16%, transparent)`;

const TAIL = {
  content: "''",
  position: 'absolute',
  left: 'calc(var(--bh-companion-tail, 50%) - 11px)',
  bottom: '-11px',
  width: '22px',
  height: '11.5px',
  pointerEvents: 'none',
} as const;

export const companionSurface = stylex.create({
  speech: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    width: '300px',
    maxWidth: 'calc(100vw - 16px)',
    backgroundColor: color.base,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.fg,
    borderRadius: radius.panel,
    color: color.fg,
    boxShadow: `0 8px 22px ${SHADOW}`,
    transformOrigin: 'var(--bh-companion-tail, 50%) calc(100% + 10px)',
    '::before': {
      ...TAIL,
      backgroundColor: color.fg,
      clipPath: "path('M0 0.5 L8.9 9.4 Q11 11.5 13.1 9.4 L22 0.5 Z')",
    },
    '::after': {
      ...TAIL,
      backgroundColor: color.base,
      clipPath: "path('M2.6 0 L10.5 7.9 Q11 8.4 11.5 7.9 L19.4 0 Z')",
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
  },
  label: {
    fontFamily: COMPANION_FONT,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
  },
  queue: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
});
