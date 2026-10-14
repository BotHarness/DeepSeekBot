import { useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  IconCheckOutlineRegular,
  IconSettingsOutlineRegular,
  IconUserOutlineRegular,
  type MenuItem,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import {
  DM_ACTION_KINDS,
  hiddenDmActionsSnapshot,
  subscribeHiddenDmActions,
  type DmActionKind,
} from './dm-actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { color, radius, space } from './ds/tokens.stylex.js';

const styles = stylex.create({
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
  },
  dot: {
    flexShrink: 0,
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.danger,
  },
  checkSlot: {
    display: 'inline-block',
    width: '16px',
    height: '16px',
  },
});

export const CHANNEL_SETTINGS_ITEM = 'settings';
export const CHANNEL_NICKNAME_ITEM = 'nickname';
export const DM_ACTIONS_ITEM = 'dm-actions';

export function ChannelAttentionDot({
  label,
}: {
  readonly label?: string | undefined;
}): ReactElement {
  return (
    <span
      data-channel-attention-dot=""
      {...stylex.props(styles.dot)}
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    />
  );
}

export function channelSettingsItem(t: BotHarnessTranslate, attention: boolean): MenuItem {
  return {
    id: CHANNEL_SETTINGS_ITEM,
    icon: <IconSettingsOutlineRegular size={16} />,
    label: attention ? (
      <span {...stylex.props(styles.label)}>
        {t('channelSettings.open')}
        <ChannelAttentionDot label={t('channelSettings.needsAttention')} />
      </span>
    ) : (
      t('channelSettings.open')
    ),
  };
}

export function channelNicknameItem(t: BotHarnessTranslate): MenuItem {
  return {
    id: CHANNEL_NICKNAME_ITEM,
    label: t('humanNickname.title'),
    icon: <IconUserOutlineRegular size={16} />,
  };
}

const dmActionItemId = (kind: DmActionKind): string => `dm:${kind}`;

export function dmActionsItem(t: BotHarnessTranslate, hidden: readonly DmActionKind[]): MenuItem {
  return {
    id: DM_ACTIONS_ITEM,
    label: t('dmTrace.menu'),
    icon: <ChannelSidebarIcon name="eye" size={16} />,
    submenu: DM_ACTION_KINDS.map((kind) => ({
      id: dmActionItemId(kind),
      label: t(`dmTrace.kind.${kind}`),
      icon: hidden.includes(kind) ? (
        <span aria-hidden="true" {...stylex.props(styles.checkSlot)} />
      ) : (
        <IconCheckOutlineRegular size={16} />
      ),
    })),
  };
}

export function dmActionKindOf(id: string): DmActionKind | undefined {
  return DM_ACTION_KINDS.find((kind) => id === dmActionItemId(kind));
}

export function useHiddenDmActions(botSlug: string | undefined): readonly DmActionKind[] {
  return useSyncExternalStore(
    subscribeHiddenDmActions,
    () => hiddenDmActionsSnapshot(botSlug),
    () => hiddenDmActionsSnapshot(botSlug),
  );
}
