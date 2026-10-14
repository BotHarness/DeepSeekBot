import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
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
import { OnboardingLauncher } from './onboarding-checklist-view.js';
import { BotIcon } from './bot-icon.js';
import { hooked } from './ds/hooked.js';
import { border, color, radius, space } from './ds/tokens.stylex.js';

const TOUCH = '44px';
const SAFE_LEFT = 'env(safe-area-inset-left)';
const SAFE_RIGHT = 'env(safe-area-inset-right)';

const styles = stylex.create({
  shell: {
    position: 'fixed',
    top: 'var(--bh-mobile-top, 0px)',
    right: 0,
    bottom: 'auto',
    left: 0,
    height: 'var(--bh-mobile-height, 100dvh)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: color.base,
    paddingLeft: SAFE_LEFT,
    paddingRight: SAFE_RIGHT,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingTop: `max(${space.x2}, env(safe-area-inset-top))`,
    paddingInline: space.x3,
    paddingBottom: space.x2,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
  },
  pane: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  nav: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: space.x2,
    paddingTop: space.x2,
    paddingInline: space.x3,
    paddingBottom: `max(${space.x2}, env(safe-area-inset-bottom))`,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  touch: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    minHeight: TOUCH,
    minWidth: TOUCH,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.fg,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  hover: {
    backgroundColor: { default: 'transparent', ':hover': color.hover },
  },
  headerButton: {
    paddingBlock: space.x2,
    paddingInline: space.x3,
  },
  navButton: {
    paddingBlock: space.x2,
    paddingInline: space.x2,
    overflowWrap: 'anywhere',
  },
  current: {
    backgroundColor: color.hover,
  },
  exit: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
});

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
  const exitButton = (inHeader: boolean): ReactElement => (
    <button
      type="button"
      {...hooked(
        'bh-mobile-exit',
        styles.touch,
        styles.exit,
        inHeader && styles.hover,
        inHeader && styles.headerButton,
      )}
      onClick={props.exitBotMode}
      aria-label={t('mobile.host')}
      title={t('mobile.host')}
    >
      <BotIcon icon={botIcon} size={24} />
    </button>
  );
  return (
    <div ref={shellMount} {...hooked('bh-root bh-mobile-shell', styles.shell)} data-page={page}>
      <style>{MOBILE_BOT_CSS}</style>
      {page === 'inbox' ? (
        <header {...hooked('bh-mobile-header', styles.header)}>
          <button
            type="button"
            {...stylex.props(styles.touch, styles.hover, styles.headerButton)}
            onClick={showList}
            aria-label={t('mobile.back')}
          >
            <IconChevronLeftOutlineRegular size={22} />
          </button>
          <strong>{t('activityCenter.title')}</strong>
          {exitButton(true)}
        </header>
      ) : null}
      <div
        {...hooked('bh-mobile-list', styles.pane)}
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
            headerEnd={
              <>
                <OnboardingLauncher actions={actions} t={t} placement="header" />
                {exitButton(false)}
              </>
            }
            actions={actions}
            companion={companion}
            useBotModePrefs={useBotModePrefs}
            setSortMode={props.setSortMode}
            setSectionSortMode={props.setSectionSortMode}
            t={t}
          />
        )}
      </div>
      <div {...hooked('bh-mobile-content', styles.pane)} hidden={page === 'list'}>
        <BotPanel {...props} onMobileBack={showList} />
      </div>
      {page === 'conversation' ? null : (
        <nav {...hooked('bh-mobile-nav', styles.nav)} aria-label={t('mobile.navigation')}>
          <button
            type="button"
            {...stylex.props(
              styles.touch,
              styles.hover,
              styles.navButton,
              page === 'list' && styles.current,
            )}
            aria-current={page === 'list' ? 'page' : undefined}
            aria-label={t('mobile.conversations')}
            title={t('mobile.conversations')}
            onClick={showList}
          >
            <IconFlatListOutlineRegular size={24} />
          </button>
          <button
            type="button"
            {...stylex.props(
              styles.touch,
              styles.hover,
              styles.navButton,
              page === 'inbox' && styles.current,
            )}
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
            {...stylex.props(styles.touch, styles.hover, styles.navButton)}
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
