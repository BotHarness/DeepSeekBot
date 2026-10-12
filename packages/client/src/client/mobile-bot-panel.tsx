import { useRef, useState, type ReactElement } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import {
  IconChevronLeftOutlineRegular,
  IconFlatListOutlineRegular,
  IconSettingsOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { BotPanel } from './bot-main.js';
import { BotSidebar } from './bot-sidebar.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import type { BotModeSortMode } from '../bot-mode-settings.js';
import { useMountedResource } from './mounted-resource.js';
import { store } from './store.js';
import { MOBILE_BOT_CSS } from './mobile-bot-styles.js';
import { useMobileBotViewport } from './mobile-viewport.js';
import { InboxIcon } from './inbox-icon.js';
import { BotIcon } from './bot-icon.js';

export function mountMobileBotShell(node: HTMLElement): () => void {
  let frame = node.parentElement;
  while (frame !== null && !frame.querySelector('nav:not(.bh-mobile-nav)'))
    frame = frame.parentElement;
  const sidebar =
    frame === null
      ? undefined
      : [...frame.children].find(
          (child) =>
            !child.contains(node) && child.querySelector('nav:not(.bh-mobile-nav)') !== null,
        );
  const previousSidebar = sidebar?.getAttribute('data-bh-mobile-sidebar');
  sidebar?.setAttribute('data-bh-mobile-sidebar', 'true');
  const viewport = window.visualViewport;
  const resize = (): void => {
    node.style.setProperty('--bh-mobile-height', `${viewport?.height ?? window.innerHeight}px`);
    node.style.setProperty('--bh-mobile-top', `${viewport?.offsetTop ?? 0}px`);
  };
  resize();
  viewport?.addEventListener('resize', resize);
  viewport?.addEventListener('scroll', resize);
  window.addEventListener('resize', resize);
  return () => {
    viewport?.removeEventListener('resize', resize);
    viewport?.removeEventListener('scroll', resize);
    window.removeEventListener('resize', resize);
    node.style.removeProperty('--bh-mobile-height');
    node.style.removeProperty('--bh-mobile-top');
    if (previousSidebar == null) sidebar?.removeAttribute('data-bh-mobile-sidebar');
    else sidebar?.setAttribute('data-bh-mobile-sidebar', previousSidebar);
  };
}

type MobileBotPanelProps = Parameters<typeof BotPanel>[0] & {
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  exitBotMode(): void;
  openBotSettings(): void;
  setSortMode(mode: BotModeSortMode): void;
  setSectionSortMode(sectionId: string, mode: BotModeSortMode | undefined): void;
};

export function MobileBotPanel(props: MobileBotPanelProps): ReactElement {
  const mobile = useMobileBotViewport();
  return mobile ? <MobileNavigation {...props} /> : <BotPanel {...props} />;
}

function MobileNavigation(props: MobileBotPanelProps): ReactElement {
  const { prefs, actions, companion, useBotModePrefs, t } = props;
  const botIcon = useBotModePrefs((value) => value.botIcon);
  const [page, setPage] = useState<'list' | 'conversation' | 'inbox'>('list');
  const navigationIntent = useRef(false);
  const shellMount = useMountedResource<HTMLDivElement>((node) => {
    store.setMode('bot');
    const releaseShell = mountMobileBotShell(node);
    let selection = store.getSnapshot().selection;
    const unsubscribe = store.subscribe(() => {
      const next = store.getSnapshot().selection;
      if (next === selection) return;
      selection = next;
      if (next !== undefined && navigationIntent.current) {
        navigationIntent.current = false;
        setPage(next.kind === 'inbox' ? 'inbox' : 'conversation');
      }
    });
    return () => {
      unsubscribe();
      releaseShell();
      store.setMode('dsh');
    };
  }, []);
  const showList = (): void => {
    navigationIntent.current = false;
    store.select(undefined);
    setPage('list');
  };
  const exitButton = (
    <button
      type="button"
      className="bh-mobile-exit"
      onClick={props.exitBotMode}
      aria-label={t('mobile.host')}
      title={t('mobile.host')}
    >
      <BotIcon icon={botIcon} size={24} />
    </button>
  );
  return (
    <div ref={shellMount} className="bh-root bh-mobile-shell" data-page={page}>
      <style>{MOBILE_BOT_CSS}</style>
      {page === 'inbox' ? (
        <header className="bh-mobile-header">
          <button type="button" onClick={showList} aria-label={t('mobile.back')}>
            <IconChevronLeftOutlineRegular size={22} />
          </button>
          <strong>{t('activityCenter.title')}</strong>
          {exitButton}
        </header>
      ) : null}
      <div
        className="bh-mobile-list"
        hidden={page !== 'list'}
        onClickCapture={(event) => {
          navigationIntent.current = true;
          if (
            event.target instanceof Element &&
            event.target.closest('button.bh-contact, button.bh-channel-row') !== null
          )
            setPage('conversation');
        }}
      >
        {prefs === undefined ? null : (
          <BotSidebar
            wide
            headerEnd={exitButton}
            actions={actions}
            companion={companion}
            useBotModePrefs={useBotModePrefs}
            setSortMode={props.setSortMode}
            setSectionSortMode={props.setSectionSortMode}
            t={t}
          />
        )}
      </div>
      <div className="bh-mobile-content" hidden={page === 'list'}>
        <BotPanel {...props} onMobileBack={showList} />
      </div>
      {page === 'conversation' ? null : (
        <nav className="bh-mobile-nav" aria-label={t('mobile.navigation')}>
          <button
            type="button"
            aria-current={page === 'list' ? 'page' : undefined}
            aria-label={t('mobile.conversations')}
            title={t('mobile.conversations')}
            onClick={showList}
          >
            <IconFlatListOutlineRegular size={24} />
          </button>
          <button
            type="button"
            aria-current={page === 'inbox' ? 'page' : undefined}
            aria-label={t('activityCenter.title')}
            title={t('activityCenter.title')}
            onClick={() => {
              setPage('inbox');
              void actions.openActivityCenter();
            }}
          >
            <InboxIcon size={24} />
          </button>
          <button
            type="button"
            onClick={props.openBotSettings}
            aria-label={t('panel.settings')}
            title={t('panel.settings')}
          >
            <IconSettingsOutlineRegular size={24} />
          </button>
        </nav>
      )}
    </div>
  );
}
