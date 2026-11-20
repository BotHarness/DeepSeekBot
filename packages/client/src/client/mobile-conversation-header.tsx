import type { MouseEventHandler, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { hooked } from './ds/hooked.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { ink, layer, size, space, type } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  header: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    width: '100%',
    minWidth: 0,
    paddingTop: `max(${space.x2}, env(safe-area-inset-top))`,
    paddingInline: space.x3,
    paddingBottom: space.x2,
    backgroundColor: layer.raised,
    pointerEvents: 'auto',
  },
  actions: { display: 'flex', alignItems: 'center' },
  title: {
    flexGrow: 1,
    margin: 0,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: ink.primary,
    fontSize: type.titleSize,
    lineHeight: type.titleLine,
    fontWeight: type.titleWeight,
  },
  action: { width: size.rowLarge, height: size.rowLarge },
});

export function CompactNavigationHeader({
  title,
  openSidebar,
  children,
  t,
}: {
  title: string;
  openSidebar: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <header {...hooked('bh-mobile-conversation-header', styles.header)}>
      <IconButton
        aria-label={t('panel.sidebar.open')}
        aria-haspopup="dialog"
        xstyle={styles.action}
        onClick={openSidebar}
      >
        <Icon name="panel-left" size={20} />
      </IconButton>
      <h1 {...stylex.props(styles.title)} title={title}>
        {title}
      </h1>
      {children}
    </header>
  );
}

export function MobileConversationHeader({
  title,
  openSidebar,
  onSettings,
  settingsOpen,
  onFiles,
  filesOpen = false,
  onInbox,
  inboxOpen = false,
  t,
}: {
  title: string;
  openSidebar: MouseEventHandler<HTMLButtonElement>;
  onSettings(): void;
  settingsOpen: boolean;
  onFiles?: (() => void) | undefined;
  filesOpen?: boolean | undefined;
  onInbox?: (() => void) | undefined;
  inboxOpen?: boolean | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <CompactNavigationHeader title={title} openSidebar={openSidebar} t={t}>
      <div {...stylex.props(styles.actions)}>
        {onInbox && (
          <IconButton
            xstyle={styles.action}
            onClick={onInbox}
            aria-label={t('entry.botInbox')}
            aria-expanded={inboxOpen}
          >
            <Icon name="inbox" size={20} />
          </IconButton>
        )}
        {onFiles && (
          <IconButton
            xstyle={styles.action}
            onClick={onFiles}
            aria-label={t('generatedFiles.title')}
            aria-expanded={filesOpen}
          >
            <Icon name="file" size={20} />
          </IconButton>
        )}
        <IconButton
          xstyle={styles.action}
          onClick={onSettings}
          aria-label={t('mobile.channelSettings')}
          aria-controls="bh-channel-sidebar"
          aria-expanded={settingsOpen}
        >
          <Icon name="panel-right" size={20} />
        </IconButton>
      </div>
    </CompactNavigationHeader>
  );
}
