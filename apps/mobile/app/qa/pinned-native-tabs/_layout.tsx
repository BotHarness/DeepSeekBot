import * as Application from 'expo-application';
import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useAvatarIcons } from '../../../src/features/pinned-tab/avatar-icon';
import { useState } from 'react';
import { View } from 'react-native';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { badgeCount } from '../../../src/ui/primitives/badge-count';
import { tabSymbols } from '../../../src/ui/shell/navigation-destinations.ios';
import { useStrings } from '../../../src/ui/strings';

export default function PinnedNativeTabsFixtureLayout() {
  if (!__DEV__ || !Application.applicationId?.endsWith('.dev')) return <Redirect href="/" />;
  return <PinnedNativeTabs />;
}

function PinnedNativeTabs() {
  const t = useStrings();
  const theme = useDesignTheme();
  const params = useGlobalSearchParams<{ icon?: string; unread?: string }>();
  const [avatarIcon] = useState(params.icon === 'avatar');
  const [unread] = useState(Number.parseInt(params.unread ?? '3', 10) || 0);
  const name = t.pinnedTabFixture.stewardName;
  const avatar = useAvatarIcons(
    { kind: 'bot', slug: 'fixture-steward', name, unread: 0 },
    avatarIcon,
  );
  const pinnedLabel = [
    t.pinnedTabFixture.tabLabel(name),
    ...(unread > 0 ? [t.pinnedTabFixture.unread(badgeCount(unread))] : []),
  ].join(', ');
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      <Stack.Screen options={{ title: t.pinnedTabFixture.title }} />
      {avatar.capture}
      <NativeTabs key={`${avatarIcon}-${avatar.key}`} tintColor={theme.color.fg}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon
            sf={{ default: tabSymbols.chats[0], selected: tabSymbols.chats[1] }}
          />
          <NativeTabs.Trigger.Label>{t.chats}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="activity">
          <NativeTabs.Trigger.Icon
            sf={{ default: tabSymbols.activity[0], selected: tabSymbols.activity[1] }}
          />
          <NativeTabs.Trigger.Label>{t.activity}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="sessions">
          <NativeTabs.Trigger.Icon
            sf={{ default: tabSymbols.sessions[0], selected: tabSymbols.sessions[1] }}
          />
          <NativeTabs.Trigger.Label>{t.hostSessions.title}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon
            sf={{ default: tabSymbols.settings[0], selected: tabSymbols.settings[1] }}
          />
          <NativeTabs.Trigger.Label>{t.settings}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="pinned"
          role="search"
          accessibilityLabel={pinnedLabel}
          testID="pinned-fixture-pinned"
        >
          {avatarIcon && avatar.icons !== undefined ? (
            <NativeTabs.Trigger.Icon src={avatar.icons} renderingMode="original" />
          ) : (
            <NativeTabs.Trigger.Icon sf={{ default: 'pin', selected: 'pin.fill' }} />
          )}
          <NativeTabs.Trigger.Label>{name}</NativeTabs.Trigger.Label>
          {unread > 0 ? (
            <NativeTabs.Trigger.Badge>{badgeCount(unread)}</NativeTabs.Trigger.Badge>
          ) : null}
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}
