import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { hooked } from './ds/hooked.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const TOUCH = '44px';

const styles = stylex.create({
  header: {
    display: 'grid',
    gridTemplateColumns: `${TOUCH} minmax(0, 1fr) ${TOUCH}`,
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minWidth: 0,
    paddingTop: `max(${space.x3}, env(safe-area-inset-top))`,
    paddingInline: space.x4,
    paddingBottom: space.x3,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: color.border,
    backgroundColor: color.base,
    pointerEvents: 'auto',
  },
  title: {
    margin: 0,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    textAlign: 'center',
    color: color.fg,
    fontSize: text.headingSize,
    lineHeight: text.headingLine,
    fontWeight: text.heavy,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH,
    minWidth: TOUCH,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.row,
    backgroundColor: 'transparent',
    color: color.fg,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `2px solid ${color.accent}` },
    outlineOffset: '-2px',
  },
});

export function MobileConversationHeader({
  title,
  onBack,
  onSettings,
  settingsOpen,
  t,
}: {
  title: string;
  onBack(): void;
  onSettings(): void;
  settingsOpen: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <header {...hooked('bh-mobile-conversation-header', styles.header)}>
      <button
        type="button"
        {...stylex.props(styles.button)}
        onClick={onBack}
        aria-label={t('mobile.back')}
        title={t('mobile.back')}
      >
        <IconChevronLeftOutlineRegular size={22} />
      </button>
      <h1 {...stylex.props(styles.title)} title={title}>
        {title}
      </h1>
      <button
        type="button"
        {...stylex.props(styles.button)}
        onClick={onSettings}
        aria-label={t('mobile.channelSettings')}
        title={t('mobile.channelSettings')}
        aria-controls="bh-channel-sidebar"
        aria-expanded={settingsOpen}
      >
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </header>
  );
}
