import * as Application from 'expo-application';
import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAvatarIcons } from '../../../src/features/pinned-tab/avatar-icon';
import { usePinnedFixtureTarget } from '../../../src/features/pinned-tab/fixture-target';
import { NativeTabMenus } from '../../../src/features/pinned-tab/native-tab-menus';
import type { NativeTabMenuSpec } from '../../../src/features/pinned-tab/native-tab-menus-model';
import { FixtureTabOrderContext } from '../../../src/features/pinned-tab/tab-order';
import { useDesignTheme } from '../../../src/ui/design/theme';
import { badgeCount } from '../../../src/ui/primitives/badge-count';
import { tabSymbols } from '../../../src/ui/shell/navigation-destinations.ios';
import { useStrings } from '../../../src/ui/strings';

type Slot = 'index' | 'pinned' | 'activity' | 'sessions' | 'settings';
type GlyphSlot = Exclude<Slot, 'pinned'>;

const scrollSlop = 8;
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
  const params = useGlobalSearchParams<{ minimize?: string; hide?: string }>();
  const [hideOnScroll] = useState(params.hide === 'scroll');
  const [hidden, setHidden] = useState(false);
  const lastOffset = useRef(0);
  const [picked, setPicked] = useState<string>();
  const [minimize] = useState(
    minimizeBehaviors.find((value) => value === params.minimize) ?? 'automatic',
  );
  const target = usePinnedFixtureTarget();
  const avatar = useAvatarIcons(target, true);
  const [swapped, setSwapped] = useState(false);
  const order = useMemo(
    () => ({
      swapped,
      toggle: () => setSwapped((value) => !value),
      target,
      picked,
      scrolled: hideOnScroll
        ? (offset: number) => {
            const travel = offset - lastOffset.current;
            lastOffset.current = offset;
            if (offset <= 0 || travel < -scrollSlop) setHidden(false);
            else if (travel > scrollSlop) setHidden(true);
          }
        : undefined,
    }),
    [swapped, target, picked, hideOnScroll],
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
  const recent = [
    { id: 'steward', label: t.pinnedTabFixture.stewardName, symbol: 'bubble.left' },
    { id: 'launch', label: t.pinnedTabFixture.channelName, symbol: 'bubble.left.and.bubble.right' },
    { id: 'ops', label: t.pinnedTabFixture.opsName, symbol: 'bubble.left.and.bubble.right' },
    { id: 'notes', label: t.pinnedTabFixture.notesName, symbol: 'bubble.left' },
  ];
  const menus: NativeTabMenuSpec[] = slots.map((slot) =>
    slot === 'index'
      ? {
          tab: slot,
          name: label(slot),
          recent,
          actions: [{ id: 'new-group', label: t.chatsCreate.group, symbol: 'plus' }],
        }
      : { tab: slot, name: slot === 'pinned' ? target.name : label(slot), recent: [], actions: [] },
  );
  const labelFor = (id: string) =>
    id === 'new-group' ? t.chatsCreate.group : recent.find((item) => item.id === id)?.label;
  return (
    <FixtureTabOrderContext value={order}>
      <View style={{ flex: 1, backgroundColor: theme.color.base }}>
        <Stack.Screen options={{ title: t.pinnedTabFixture.title }} />
        {avatar.capture}
        {avatar.icons === undefined ? null : (
          <NativeTabs
            key={avatar.key}
            tintColor={theme.color.fg}
            minimizeBehavior={minimize}
            hidden={hidden}
          >
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
        {avatar.icons === undefined ? null : (
          <NativeTabMenus
            key={`${avatar.key}:${slots.join(',')}`}
            tabs={menus}
            pill
            onSelect={(_tab, id) => setPicked(labelFor(id))}
          />
        )}
      </View>
    </FixtureTabOrderContext>
  );
}
