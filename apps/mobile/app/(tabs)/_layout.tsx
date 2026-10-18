import { StatusBar } from 'expo-status-bar';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { ComponentProps } from 'react';
import { Platform, View } from 'react-native';

import { useActivityCount } from '../../src/host/native-activity-count';
import { badgeCount } from '../../src/ui/primitives/badge-count';
import { useDesignTheme, type DesignTheme } from '../../src/ui/design/theme';
import { ScrollChromeProvider, useChromeHidden } from '../../src/ui/shell/scroll-chrome';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  return (
    <ScrollChromeProvider>
      <NativeTabLayout />
    </ScrollChromeProvider>
  );
}

function NativeTabLayout() {
  const theme = useDesignTheme();
  const pending = useActivityCount().count ?? 0;
  const hidden = useChromeHidden();
  return (
    <View style={{ flex: 1 }}>
      <NativeTabs {...chrome(theme)} hidden={hidden}>
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Icon
            sf={{
              default: 'bubble.left.and.bubble.right',
              selected: 'bubble.left.and.bubble.right.fill',
            }}
            md="chat"
          />
          <NativeTabs.Trigger.Label>{t.chats}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="(activity)"
          unstable_nativeProps={{
            onDidAppear: () => StatusBar.setStyle(theme.scheme === 'dark' ? 'light' : 'dark'),
          }}
        >
          <NativeTabs.Trigger.Icon
            sf={{ default: 'bell', selected: 'bell.fill' }}
            md="notifications"
          />
          <NativeTabs.Trigger.Label>{t.activity}</NativeTabs.Trigger.Label>
          {pending > 0 ? (
            <NativeTabs.Trigger.Badge>{badgeCount(pending)}</NativeTabs.Trigger.Badge>
          ) : null}
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}

type Chrome = Omit<ComponentProps<typeof NativeTabs>, 'children'>;

function chrome(theme: DesignTheme): Chrome {
  if (Platform.OS === 'ios') return { tintColor: theme.color.fg };
  return {
    tintColor: theme.color.fg,
    backgroundColor: theme.color.base,
    indicatorColor: theme.color.selected,
    iconColor: { default: theme.color.muted, selected: theme.color.fg },
    labelStyle: {
      default: { color: theme.color.muted },
      selected: { color: theme.color.fg, fontWeight: theme.weight.strong },
    },
    labelVisibilityMode: 'labeled',
  };
}
