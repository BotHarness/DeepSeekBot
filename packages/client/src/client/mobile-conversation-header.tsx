import type { ReactElement } from 'react';
import { IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotHarnessTranslate } from './locale.js';

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
    <header className="bh-mobile-conversation-header">
      <button type="button" onClick={onBack} aria-label={t('mobile.back')} title={t('mobile.back')}>
        <IconChevronLeftOutlineRegular size={22} />
      </button>
      <h1 title={title}>{title}</h1>
      <button
        type="button"
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
