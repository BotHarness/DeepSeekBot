import { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { actionCount } from '../../src/host/inbox';
import { useHostSession, useInbox } from '../../src/host/host-session';
import { useDesignTheme, type DesignTheme } from '../../src/ui/design/theme';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  const theme = useDesignTheme();
  const { inbox } = useHostSession();
  const pending = actionCount(useInbox(inbox));
  return (
    <NativeTabs {...chrome(theme)}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>{t.home}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(activity)">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bell', selected: 'bell.fill' }}
          md="notifications"
        />
        <NativeTabs.Trigger.Label>{t.activity}</NativeTabs.Trigger.Label>
        {pending > 0 ? (
          <NativeTabs.Trigger.Badge>{String(pending)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(me)">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
        <NativeTabs.Trigger.Label>{t.me}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
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
