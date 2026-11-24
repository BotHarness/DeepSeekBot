import * as Application from 'expo-application';
import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAvatarIcons } from '../../../src/features/pinned-tab/avatar-icon';
import { usePinnedFixtureTarget } from '../../../src/features/pinned-tab/fixture-target';
import { FixtureTabOrderContext } from '../../../src/features/pinned-tab/tab-order';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { badgeCount } from '../../../src/ui/primitives/badge-count';
import { tabSymbols } from '../../../src/ui/shell/navigation-destinations.ios';
import { useStrings } from '../../../src/ui/strings';

type Slot = 'index' | 'pinned' | 'activity' | 'sessions' | 'settings';
type GlyphSlot = Exclude<Slot, 'pinned'>;

const minimizeBehaviors = ['automatic', 'never', 'onScrollDown', 'onScrollUp'] as const;
const glyphs: Record<GlyphSlot, (typeof tabSymbols)[keyof typeof tabSymbols]> = {
  index: tabSymbols.chats,
  activity: tabSymbols.activity,
  sessions: tabSymbols.sessions,
  settings: tabSymbols.settings,
};

export default function PinnedRegularNativeTabsFixtureLayout() {
  if (!__DEV__ || !Application.applicationId?.endsWith('.dev')) return <Redirect href="/" />;
  return <PinnedRegularNativeTabs />;
}

function PinnedRegularNativeTabs() {
  const t = useStrings();
  const theme = useDesignTheme();
  const params = useGlobalSearchParams<{ minimize?: string }>();
  const [minimize] = useState(
    minimizeBehaviors.find((value) => value === params.minimize) ?? 'automatic',
  );
  const target = usePinnedFixtureTarget();
  const avatar = useAvatarIcons(target, true);
  const [swapped, setSwapped] = useState(false);
  const order = useMemo(
    () => ({ swapped, toggle: () => setSwapped((value) => !value), target }),
    [swapped, target],
  );
  const slots: readonly Slot[] = swapped
    ? ['index', 'activity', 'sessions', 'settings', 'pinned']
    : ['index', 'pinned', 'activity', 'sessions', 'settings'];
  const label = (slot: GlyphSlot) =>
    slot === 'index'
      ? t.chats
      : slot === 'activity'
        ? t.activity
        : slot === 'sessions'
          ? t.hostSessions.title
          : t.settings;
  const pinnedLabel = [
    t.pinnedTabFixture.tabLabel(target.name),
    ...(target.unread > 0 ? [t.pinnedTabFixture.unread(badgeCount(target.unread))] : []),
  ].join(', ');
  return (
    <FixtureTabOrderContext value={order}>
      <View style={{ flex: 1, backgroundColor: theme.color.base }}>
        <Stack.Screen options={{ title: t.pinnedTabFixture.title }} />
        {avatar.capture}
        {avatar.icons === undefined ? null : (
          <NativeTabs key={avatar.key} tintColor={theme.color.fg} minimizeBehavior={minimize}>
            {slots.map((slot) =>
              slot === 'pinned' ? (
                <NativeTabs.Trigger
                  key={slot}
                  name={slot}
                  accessibilityLabel={pinnedLabel}
                  testID="pinned-fixture-pinned"
                >
                  <NativeTabs.Trigger.Icon src={avatar.icons} renderingMode="original" />
                  <NativeTabs.Trigger.Label hidden />
                  {target.unread > 0 ? (
                    <NativeTabs.Trigger.Badge>{badgeCount(target.unread)}</NativeTabs.Trigger.Badge>
                  ) : null}
                </NativeTabs.Trigger>
              ) : (
                <NativeTabs.Trigger
                  key={slot}
                  name={slot}
                  accessibilityLabel={label(slot)}
                  testID={`pinned-fixture-${slot}`}
                >
                  <NativeTabs.Trigger.Icon
                    sf={{ default: glyphs[slot][0], selected: glyphs[slot][1] }}
                  />
                  <NativeTabs.Trigger.Label hidden />
                </NativeTabs.Trigger>
              ),
            )}
          </NativeTabs>
        )}
      </View>
    </FixtureTabOrderContext>
  );
}
