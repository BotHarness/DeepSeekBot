import * as Application from 'expo-application';
import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useState } from 'react';
import { PixelRatio, View, type ViewInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { PinnedAvatar } from '../../../src/features/pinned-tab/pinned-avatar';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { materialNavigationBar, navigationBar } from '../../../src/ui/design/tokens';
import { badgeCount } from '../../../src/ui/primitives/badge-count';
import { useMounted } from '../../../src/ui/mounted';
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
  const [plainUri, setPlainUri] = useState<string>();
  const [ringUri, setRingUri] = useState<string>();
  const plain = useAvatarCapture(avatarIcon, setPlainUri);
  const ringed = useAvatarCapture(avatarIcon, setRingUri);
  const name = t.pinnedTabFixture.stewardName;
  const pinnedLabel = [
    t.pinnedTabFixture.tabLabel(name),
    ...(unread > 0 ? [t.pinnedTabFixture.unread(badgeCount(unread))] : []),
  ].join(', ');
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      <Stack.Screen options={{ title: t.pinnedTabFixture.title }} />
      {avatarIcon ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: -materialNavigationBar.height * 2, top: 0 }}
        >
          {[plain, ringed].map((ref, index) => (
            <View key={index} ref={ref} collapsable={false}>
              <PinnedAvatar
                target={{ kind: 'bot', slug: 'fixture-steward', name, unread: 0 }}
                size={navigationBar.symbolBox}
                selected={index === 1}
                ring={index === 1}
                unread={false}
              />
            </View>
          ))}
        </View>
      ) : null}
      <NativeTabs
        key={`${avatarIcon}-${plainUri ?? ''}-${ringUri ?? ''}`}
        tintColor={theme.color.fg}
      >
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
          {avatarIcon && plainUri !== undefined && ringUri !== undefined ? (
            <NativeTabs.Trigger.Icon
              src={{
                default: { uri: plainUri, scale: PixelRatio.get() },
                selected: { uri: ringUri, scale: PixelRatio.get() },
              }}
              renderingMode="original"
            />
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

function useAvatarCapture(enabled: boolean, done: (uri: string) => void) {
  return useMounted<ViewInstance>(
    (view) => {
      if (!enabled) return;
      let live = true;
      const timer = setTimeout(() => {
        void captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' }).then((uri) => {
          if (live) done(uri);
        });
      }, 300);
      return () => {
        live = false;
        clearTimeout(timer);
      };
    },
    [enabled],
  );
}
