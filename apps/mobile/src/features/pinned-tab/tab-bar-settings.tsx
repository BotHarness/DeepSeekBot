import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { useRouter } from 'expo-router';
import { useSyncExternalStore } from 'react';

import { useHostLook } from '../../host/native-host-look';
import { SHEET_GROUP } from '../../ui/chat/sheet';
import { titleOf } from '../../ui/chat/conversations';
import { useDesignTheme } from '../../ui/design/theme';
import { edge, space } from '../../ui/design/tokens';
import { interfacePreferences } from '../../ui/interface-preferences';
import { SettingsForm } from '../../ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../../ui/primitives/settings-row';
import { TabOrderList, type TabOrderItem } from '../../ui/primitives/tab-order-list';
import { navigationLabel } from '../../ui/shell/navigation-label';
import {
  defaultTabOrder,
  isDefaultTabOrder,
  moveVisibleTab,
  visibleTabs,
  type TabSlot,
} from '../../ui/shell/tab-slots';
import { tabSymbols } from '../../ui/shell/tab-symbols';
import { useStrings } from '../../ui/strings';
import { PinnedAvatar } from './pinned-avatar';
import { usePinnedHost, usePinnedTab } from './use-pinned-tab';

const androidSymbols: Record<Exclude<TabSlot, 'pinned'>, TabOrderItem['symbol']['android']> = {
  chats: 'forum',
  activity: 'notifications',
  sessions: 'code',
  settings: 'settings',
};

function usePreferences() {
  return useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
}

export function TabBarLink() {
  const t = useStrings();
  const router = useRouter();
  return (
    <SettingsRow
      on={SHEET_GROUP}
      title={t.tabBarSettings.title}
      icon="tabBar"
      disclosure
      testID="settings-tab-bar"
      onPress={() => router.push('/settings/tab-bar')}
    />
  );
}

export function TabBarSettings() {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const state = usePreferences();
  const pinned = usePinnedTab();
  const { host } = usePinnedHost();
  const look = useHostLook(host?.saved.hostId);
  const order = visibleTabs(state.tabOrder, state.sessionsTab);
  const avatarSize = theme.type.title.line * theme.fontScale + (edge.focus + space.x1) * 2;
  const items: TabOrderItem[] = order.map((slot) =>
    slot === 'pinned'
      ? {
          key: slot,
          label: navigationLabel(t, slot, pinned?.name),
          symbol: { ios: 'pin', android: 'keep' },
          avatar: (
            <PinnedAvatar conversation={pinned?.conversation} size={avatarSize} selected={false} />
          ),
        }
      : {
          key: slot,
          label: navigationLabel(t, slot),
          symbol: { ios: tabSymbols[slot].default, android: androidSymbols[slot] },
        },
  );
  const copy = t.tabBarSettings;
  return (
    <SettingsForm testID="tab-bar-settings" reordering>
      <TabOrderList
        title={copy.order}
        footer={state.sessionsTab ? copy.orderFooter : copy.orderFooterSessions}
        items={items}
        on={SHEET_GROUP}
        copy={copy}
        onMove={(from, destination) => {
          if (!state.loaded) return;
          interfacePreferences.setTabOrder(
            moveVisibleTab(state.tabOrder, state.sessionsTab, from, destination),
          );
        }}
      />
      {isDefaultTabOrder(state.tabOrder) ? null : (
        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            title={copy.reset}
            tone="accent"
            testID="tab-order-reset"
            onPress={() => interfacePreferences.setTabOrder(defaultTabOrder)}
          />
        </SettingsSection>
      )}
      <SettingsSection
        title={copy.pinned}
        on={SHEET_GROUP}
        footer={
          host === undefined
            ? copy.pinnedFooterNone
            : copy.pinnedFooter(shownHostName(look, host.saved.hostName))
        }
      >
        <SettingsRow
          on={SHEET_GROUP}
          title={copy.conversation}
          icon="pin"
          testID="settings-pinned-conversation"
          control={{
            kind: 'value',
            text: pinned === undefined ? t.pinnedTab.title : titleOf(pinned.conversation),
            chevron: true,
          }}
          onPress={
            host === undefined ? undefined : () => router.push('/settings/pinned-conversation')
          }
        />
      </SettingsSection>
    </SettingsForm>
  );
}
