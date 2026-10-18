import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { hooked } from './ds/hooked.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const TOUCH = '44px';

const styles = stylex.create({
  header: {
    display: 'grid',
    gridTemplateColumns: `${TOUCH} minmax(0, 1fr) auto`,
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minWidth: 0,
    paddingTop: `max(${space.x3}, env(safe-area-inset-top))`,
    paddingInline: space.x4,
    paddingBottom: space.x3,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
    backgroundColor: color.base,
    pointerEvents: 'auto',
  },
  actions: { display: 'flex', alignItems: 'center' },
  title: {
    margin: 0,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    textAlign: 'center',
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH,
    minWidth: TOUCH,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.fg,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
});

export function MobileConversationHeader({
  title,
  onBack,
  onSettings,
  settingsOpen,
  onFiles,
  filesOpen = false,
  onInbox,
  inboxOpen = false,
  t,
}: {
  title: string;
  onBack(): void;
  onSettings(): void;
  settingsOpen: boolean;
  onFiles?: (() => void) | undefined;
  filesOpen?: boolean | undefined;
  onInbox?: (() => void) | undefined;
  inboxOpen?: boolean | undefined;
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
      <div {...stylex.props(styles.actions)}>
        {onInbox && (
          <button
            type="button"
            {...stylex.props(styles.button)}
            onClick={onInbox}
            aria-label={t('entry.botInbox')}
            aria-expanded={inboxOpen}
          >
            <ChannelSidebarIcon name="inbox" size={22} />
          </button>
        )}
        {onFiles && (
          <button
            type="button"
            {...stylex.props(styles.button)}
            onClick={onFiles}
            aria-label={t('generatedFiles.title')}
            aria-expanded={filesOpen}
          >
            <ChannelSidebarIcon name="file" size={22} />
          </button>
        )}
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
      </div>
    </header>
  );
}
