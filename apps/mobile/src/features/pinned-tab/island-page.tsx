import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotPortrait } from '../../ui/bot-avatar';
import { AvatarSlot, CONVERSATION_AVATAR } from '../../ui/chat/avatar-slot';
import { ConversationGroupAvatar, ConversationRowFrame } from '../../ui/chat/conversation-row';
import { useDesignTheme } from '../../ui/design/theme';
import { floatingToolbar, radius, space, tabChrome } from '../../ui/design/tokens';
import { haptic } from '../../ui/haptics';
import { showActionMenu } from '../../ui/primitives/app-dialog';
import { badgeCount } from '../../ui/primitives/badge-count';
import { Text } from '../../ui/primitives/text';
import { useSystemReducedMotion } from '../../ui/primitives/use-system-reduced-motion';
import { noteTouch } from '../../ui/primitives/touch-anchor';
import { chromeScroll, chromeShown, type ChromeScroll } from '../../ui/shell/tab-chrome';
import { PlusIcon } from '../../ui/shell/icons';
import { TabNamePill } from '../../ui/shell/tab-name-pill';
import { TabPageHeader } from '../../ui/shell/tab-page-header';
import { useStrings } from '../../ui/strings';
import type { IslandItem, IslandLayout } from './island-model';
import { IslandToolbar } from './island-toolbar';
import { pinnedTabOrder, type PinnedTabSlot, type PinnedTarget } from './prototype-model';

type Row = { key: string; name: string; kind: 'bot' | 'channel'; unread: number };

const extraRows = Array.from({ length: 16 }, (_, index) => index + 5);

function clock(index: number): string {
  const minutes = 9 * 60 + 41 - index * 23;
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function IslandFixturePage() {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reduced = useSystemReducedMotion();
  const params = useLocalSearchParams<{ target?: string; selected?: string }>();
  const target: PinnedTarget =
    params.target === 'channel'
      ? { kind: 'channel', name: t.pinnedTabFixture.channelName, unread: 3 }
      : { kind: 'bot', slug: 'fixture-steward', name: t.pinnedTabFixture.stewardName, unread: 0 };
  const [selected, setSelected] = useState<PinnedTabSlot>(
    pinnedTabOrder.find((slot) => slot === params.selected) ?? 'chats',
  );
  const [picked, setPicked] = useState<string>();
  const [pill, setPill] = useState<{ label: string; index: number; key: number }>();
  const [layout, setLayout] = useState<IslandLayout>({ width: 0, height: 0, pad: 0 });
  const hidden = useSharedValue(0);
  const scroll = useSharedValue<ChromeScroll>(chromeShown);
  const bottom = insets.bottom + floatingToolbar.offset;
  const name = (slot: PinnedTabSlot) =>
    slot === 'pinned'
      ? target.name
      : slot === 'chats'
        ? t.chats
        : slot === 'activity'
          ? t.activity
          : slot === 'sessions'
            ? t.hostSessions.title
            : t.settings;
  const recent = [
    t.pinnedTabFixture.stewardName,
    t.pinnedTabFixture.channelName,
    t.pinnedTabFixture.opsName,
    t.pinnedTabFixture.notesName,
  ];
  const flash = (index: number, label: string) =>
    setPill((previous) => ({ label, index, key: (previous?.key ?? 0) + 1 }));
  const items: IslandItem[] = pinnedTabOrder.map((slot, index) => {
    const label =
      slot === 'pinned'
        ? [
            t.pinnedTabFixture.tabLabel(target.name),
            ...(target.unread > 0 ? [t.pinnedTabFixture.unread(badgeCount(target.unread))] : []),
          ].join(', ')
        : name(slot);
    const menu = slot === 'chats';
    return {
      slot,
      label,
      focused: slot === selected,
      menuLabel: menu ? t.tabMenuAction : undefined,
      onPress() {
        if (slot !== selected) haptic('selection');
        setSelected(slot);
        flash(index, name(slot));
      },
      onLongPress() {
        if (!menu) {
          flash(index, name(slot));
          return;
        }
        noteTouch({
          nativeEvent: {
            pageX: center(index),
            pageY: window.height - bottom - layout.height,
          },
        });
        haptic('menu');
        showActionMenu(name(slot), [
          ...recent.map((text, row) => ({
            text,
            icon: row === 1 || row === 2 ? ('channel' as const) : ('chat' as const),
            onPress: () => setPicked(text),
          })),
          {
            text: t.chatsCreate.group,
            icon: PlusIcon,
            group: 1,
            onPress: () => setPicked(t.chatsCreate.group),
          },
        ]);
      },
    };
  });
  const center = (index: number) =>
    (window.width - layout.width) / 2 +
    layout.pad +
    index * floatingToolbar.item +
    floatingToolbar.item / 2;
  const onScroll = useAnimatedScrollHandler({
    onScroll(event) {
      const offset = event.contentOffset.y;
      const end = Math.max(0, event.contentSize.height - event.layoutMeasurement.height);
      const next = chromeScroll(scroll.value, offset, end);
      const was = scroll.value.hidden;
      scroll.value = next;
      if (next.hidden === was) return;
      const goal = next.hidden ? 1 : 0;
      hidden.value = reduced ? goal : withTiming(goal, { duration: tabChrome.hideDuration });
    },
  });
  const travel = layout.height + bottom + space.x6;
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: hidden.value * travel }] }));
  const rows: Row[] = [
    { key: 'steward', name: t.pinnedTabFixture.stewardName, kind: 'bot', unread: 0 },
    { key: 'launch', name: t.pinnedTabFixture.channelName, kind: 'channel', unread: 3 },
    { key: 'ops', name: t.pinnedTabFixture.opsName, kind: 'channel', unread: 0 },
    { key: 'notes', name: t.pinnedTabFixture.notesName, kind: 'bot', unread: 1 },
    ...extraRows.map((index): Row => ({
      key: `bot-${index}`,
      name: t.pinnedTabFixture.botName(index),
      kind: index % 4 === 0 ? 'channel' : 'bot',
      unread: 0,
    })),
  ];
  return (
    <View testID="pinned-fixture-island" style={{ flex: 1, backgroundColor: theme.color.base }}>
      <TabPageHeader
        testID="pinned-island-header"
        leading={<Text variant="display">{name(selected)}</Text>}
      />
      <Animated.FlatList
        testID="pinned-island-list"
        data={rows}
        keyExtractor={(row) => row.key}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: travel }}
        ListHeaderComponent={
          picked === undefined ? undefined : (
            <Text
              testID="pinned-island-picked"
              tone="muted"
              style={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}
            >
              {t.pinnedTabFixture.picked(picked)}
            </Text>
          )
        }
        renderItem={({ item, index }) => (
          <ConversationRowFrame
            testID={`pinned-island-row-${item.key}`}
            title={item.name}
            source="computer"
            mixed={false}
            label={item.name}
            preview={t.pinnedTabFixture.preview(index + 1)}
            time={clock(index)}
            unread={item.unread > 0}
            badge={item.unread > 0 ? { tone: 'unread', count: item.unread } : undefined}
            avatar={
              item.kind === 'bot' ? (
                <AvatarSlot>
                  <BotPortrait
                    bot={{ slug: item.key, displayName: item.name }}
                    size={CONVERSATION_AVATAR}
                    corner={radius.md}
                  />
                </AvatarSlot>
              ) : (
                <ConversationGroupAvatar />
              )
            }
            onPress={() => undefined}
          />
        )}
      />
      <Animated.View
        style={[{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }, slide]}
      >
        <IslandToolbar items={items} target={target} onLayout={setLayout} />
      </Animated.View>
      {pill === undefined ? null : (
        <TabNamePill
          key={pill.key}
          label={pill.label}
          center={center(pill.index)}
          screenWidth={window.width}
          bottom={bottom + layout.height + space.x3}
        />
      )}
    </View>
  );
}
