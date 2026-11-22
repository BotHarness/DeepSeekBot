import { Icon } from './ds/icon.js';
import { unreadCountLabel } from './unread-count.js';
import { observeHumanAttention } from './messaging-defaults-live.js';
import { useState, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { type SnapshotSelectorHook, shallowEqual } from '@deepseek-ai/dsh-client-store';
import { BotIcon, botBackdropUri } from './bot-icon.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { InboxIcon } from './inbox-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { useClientStore } from './use-client-store.js';

export interface BotPanelEntryProps {
  size: number;
  active: boolean;
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  openSettings: () => void;
  t: BotHarnessTranslate;
}

export function BotPanelIcon({
  size,
  active,
  onExit,
  useBotModePrefs,
  openSettings,
  openActivityCenter,
  refreshStatus,
  tutorial,
  t,
}: BotPanelEntryProps & {
  onExit: () => void;
  openActivityCenter: () => void;
  refreshStatus: () => Promise<void>;
  tutorial?: BotPanelTutorial | undefined;
}): ReactElement {
  const icon = useBotModePrefs((prefs) => prefs.botIcon);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const wide = size === 16;
  const state = {
    activityList: useClientStore(
      (value) => ({
        unreadCount: value.activityList.unreadCount,
        hasAction: value.activityList.hasAction,
      }),
      shallowEqual,
    ),
    selection: useClientStore((value) => value.selection),
  };
  const entryHidden = !active && (!wide || state.activityList.unreadCount === 0);
  const panelList = row?.parentElement;
  const entryLabel = [
    t('activityCenter.title'),
    ...(state.activityList.unreadCount > 0
      ? [
          t('activityList.unreadCount', {
            count: unreadCountLabel(state.activityList.unreadCount),
          }),
        ]
      : []),
    ...(state.activityList.hasAction ? [t('activityList.action')] : []),
  ].join(' · ');
  const entryMount = useMountedResource<HTMLElement>(() => {
    void refreshStatus();
    return observeHumanAttention(() => void refreshStatus());
  }, [refreshStatus]);

  const glyphMount = useMountedResource<HTMLSpanElement>(
    (glyph) => {
      const button = glyph.closest('button');
      setRow(button);
      button?.style.setProperty('--bh-bot-texture', `url("${botBackdropUri(icon)}")`);
      if (button === null) return;
      button.setAttribute('data-bh-tour', 'bot-mode');
      button.toggleAttribute('data-bh-wide-glyph', wide);
      const priorGridRow = button.style.gridRow;
      const siblings = Array.from(button.parentElement?.children ?? []).filter(
        (node) => !node.classList.contains('bh-activity-list-entry'),
      );
      button.style.gridRow = String(siblings.indexOf(button) + 1);
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (
          (event.target as Element | null)?.closest(
            '.bh-panel-gear, .bh-panel-activity, .bh-onboarding-launcher',
          ) !== null
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        onExit();
      };
      const onClick = (event: MouseEvent): void => {
        if (
          (event.target as Element | null)?.closest(
            '.bh-panel-gear, .bh-panel-activity, .bh-onboarding-launcher',
          ) !== null
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        onExit();
      };
      if (active) {
        button.addEventListener('keydown', onKeyDown);
        button.addEventListener('click', onClick, true);
      }
      return () => {
        button.removeAttribute('data-bh-wide-glyph');
        button.style.gridRow = priorGridRow;
        button.removeEventListener('keydown', onKeyDown);
        button.removeEventListener('click', onClick, true);
      };
    },
    [size, wide, icon, active, onExit],
  );

  const openInbox = (event: SyntheticEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    openActivityCenter();
  };
  const inboxProps = {
    className: 'bh-root bh-activity-list-entry bh-panel-activity',
    'data-bh-tour': 'inbox',
    'data-wide': wide ? 'true' : 'false',
    'data-unread': state.activityList.unreadCount > 0 ? 'true' : 'false',
    'data-active': active ? 'true' : 'false',
    tabIndex: entryHidden ? -1 : 0,
    'aria-hidden': entryHidden ? true : undefined,
    ref: entryMount,
    'aria-label': entryLabel,
    title: entryLabel,
    'aria-current': active && state.selection?.kind === 'inbox' ? ('page' as const) : undefined,
  };

  return (
    <span className="bh-panel-glyph" ref={glyphMount} {...(wide ? { 'data-wide': 'true' } : {})}>
      <BotIcon icon={icon} size={size} />
      {row !== null && !wide && panelList != null
        ? createPortal(
            <button
              type="button"
              {...inboxProps}
              style={{ gridRow: Number(row.style.gridRow) + 1 }}
              onClick={(event) => {
                event.stopPropagation();
                openActivityCenter();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
              }}
            >
              <InboxIcon size={18} />
              {active && (state.activityList.unreadCount > 0 || state.activityList.hasAction) ? (
                <span className="bh-activity-list-notification-dot" aria-hidden="true" />
              ) : null}
            </button>,
            panelList,
          )
        : null}
      {row !== null && wide
        ? createPortal(
            <span className="bh-panel-actions">
              {tutorial !== undefined
                ? active
                  ? tutorial.launcher(t)
                  : tutorial.enterHint(t)
                : null}
              <span
                role="button"
                {...inboxProps}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={openInbox}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') openInbox(event);
                }}
              >
                <InboxIcon size={16} />
                {state.activityList.unreadCount > 0 ? (
                  <span className="bh-activity-list-count">
                    {unreadCountLabel(state.activityList.unreadCount)}
                  </span>
                ) : null}
              </span>
              {active ? (
                <span
                  className="bh-panel-gear"
                  data-bh-tour="bot-settings"
                  role="button"
                  tabIndex={0}
                  aria-label={t('panel.settings')}
                  title={t('panel.settings')}
                  onClick={(event) => {
                    event.stopPropagation();
                    openSettings();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSettings();
                  }}
                >
                  <Icon name="settings" size={14} />
                </span>
              ) : null}
            </span>,
            row,
          )
        : null}
    </span>
  );
}

export interface BotPanelTutorial {
  launcher(t: BotHarnessTranslate): ReactNode;
  enterHint(t: BotHarnessTranslate): ReactNode;
}

export function createBotPanelEntry(
  onExit: () => void,
  openActivityCenter: () => void,
  refreshStatus: () => Promise<void>,
  tutorial?: BotPanelTutorial,
): (props: BotPanelEntryProps) => ReactElement {
  return function BotPanelEntry({ size, active, useBotModePrefs, openSettings, t }) {
    return (
      <BotPanelIcon
        size={size}
        active={active}
        onExit={onExit}
        openActivityCenter={openActivityCenter}
        refreshStatus={refreshStatus}
        tutorial={tutorial}
        useBotModePrefs={useBotModePrefs}
        openSettings={openSettings}
        t={t}
      />
    );
  };
}
