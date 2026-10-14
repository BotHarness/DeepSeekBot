import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { actionCount } from '../../src/host/inbox';
import { useHostSession, useInbox } from '../../src/host/host-session';
import { useDesignTheme } from '../../src/ui/design/theme';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  const theme = useDesignTheme();
  const { inbox } = useHostSession();
  const pending = actionCount(useInbox(inbox));
  return (
    <NativeTabs tintColor={theme.color.accent}>
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
