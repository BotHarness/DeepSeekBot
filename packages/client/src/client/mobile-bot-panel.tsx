import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { BotPanel } from './bot-main.js';
import { BotModeSidebar, type BotModeSidebarProps } from './bot-mode-sidebar.js';
import { Dialog } from './ds/dialog.js';
import { hooked } from './ds/hooked.js';
import { layer, size, space } from './ds/tobs.stylex.js';
import { viewportInsets } from './ds/viewport-insets.stylex.js';
import { useWindowClass } from './ds/window-class.js';
import { MOBILE_BOT_CSS } from './mobile-bot-styles.js';
import { useMountedResource } from './mounted-resource.js';
import { claimSidebarCommand } from './workspace-shell.js';

const styles = stylex.create({
  inline: { display: 'contents' },
  narrow: {
    position: 'fixed',
    top: 'var(--bh-mobile-top, 0px)',
    right: 0,
    left: 0,
    height: 'var(--bh-mobile-height, 100dvh)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    paddingLeft: viewportInsets.left,
    paddingRight: viewportInsets.right,
    backgroundColor: layer.canvas,
  },
  medium: { flexDirection: 'row', gap: space.x2 },
  sidebar: { width: 'min(280px, 40%)', flexShrink: 0, backgroundColor: layer.nav },
  rail: { width: `calc(${size.rowLarge} + ${space.x3})` },
  content: {
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
});

export function mountMobileBotShell(node: HTMLElement): () => void {
  let frame = node.parentElement;
  while (frame !== null && !frame.querySelector('[data-slot="sidebar"]'))
    frame = frame.parentElement;
  const sidebar =
    frame === null
      ? undefined
      : [...frame.children].find(
          (child) => !child.contains(node) && child.querySelector('[data-slot="sidebar"]') !== null,
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

type MobileBotPanelProps = Parameters<typeof BotPanel>[0] &
  Pick<
    BotModeSidebarProps,
    | 'exitBotMode'
    | 'openBotSettings'
    | 'quickSwitcherSettings'
    | 'setSortMode'
    | 'setSectionSortMode'
    | 'shortcutBindings'
    | 'useBotModePrefs'
  >;

export function MobileBotPanel(props: MobileBotPanelProps): ReactElement {
  const windowClass = useWindowClass();
  const compact = windowClass === 'compact';
  const medium = windowClass === 'medium';
  const narrow = compact || medium;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rail, setRail] = useState(false);
  const layout = props.workspace?.layout;
  const shellMount = useMountedResource<HTMLDivElement>(
    (node) => {
      if (!compact) setDrawerOpen(false);
      if (!narrow) return;
      const releaseShell = mountMobileBotShell(node);
      const releaseCommand = layout
        ? claimSidebarCommand(layout, () => {
            if (compact) setDrawerOpen((open) => !open);
            else setRail((collapsed) => !collapsed);
          })
        : undefined;
      return () => {
        releaseCommand?.();
        releaseShell();
      };
    },
    [compact, narrow, layout],
  );
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div
      ref={shellMount}
      data-bot-window-class={windowClass}
      {...(narrow
        ? hooked('bh-root bh-mobile-shell', styles.narrow, medium && styles.medium)
        : stylex.props(styles.inline))}
    >
      {narrow && <style>{MOBILE_BOT_CSS}</style>}
      {medium && (
        <div {...stylex.props(styles.sidebar, rail && styles.rail)}>
          <BotModeSidebar
            {...props}
            collapsed={rail}
            width={0}
            dockPanels={undefined}
            toggleSidebar={() => setRail(!rail)}
          />
        </div>
      )}
      <div
        {...(compact
          ? hooked('bh-mobile-content', styles.content)
          : stylex.props(narrow ? styles.content : styles.inline))}
      >
        <BotPanel {...props} openCompactSidebar={compact ? () => setDrawerOpen(true) : undefined} />
      </div>
      {compact && (
        <Dialog
          open={drawerOpen}
          title={props.t('mobile.navigation')}
          presentation="drawer"
          unsized
          onClose={closeDrawer}
        >
          <BotModeSidebar
            {...props}
            collapsed={false}
            width={0}
            dockPanels={undefined}
            closeDrawer={closeDrawer}
            toggleSidebar={closeDrawer}
          />
        </Dialog>
      )}
    </div>
  );
}
