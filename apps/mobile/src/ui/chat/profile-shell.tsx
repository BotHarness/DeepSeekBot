import { useProfilePaging } from './profile-paging';
import { useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  I18nManager,
  Platform,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { useDesignTheme } from '../design/theme';
import { spring } from '../design/motion';
import { radius, space, swipeRow } from '../design/tokens';
import { systemSegmented } from '../design/system-shape';
import { IconTabs, type IconTabOption } from '../primitives/icon-tabs';
import { Text } from '../primitives/text';
import { BackIcon } from '../shell/back-icon';
import { useStrings } from '../strings';
import { HeaderCircleButton } from './header-chrome';
import { swipedTab, type ProfileTab } from './profile-tabs';

export type ProfileRow = { key: string; render(): ReactNode };

export type ProfileTabBody = {
  rows: readonly ProfileRow[];
  action?: ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
};

type Item =
  | { kind: 'identity'; key: 'identity' }
  | { kind: 'tabs'; key: 'tabs' }
  | { kind: 'top'; key: string }
  | { kind: 'row'; key: string; row: ProfileRow }
  | { kind: 'empty'; key: string }
  | { kind: 'footer'; key: string };

const AnimatedList = Animated.createAnimatedComponent(FlatList<Item>);

const tabsRadius = Platform.OS === 'ios' ? systemSegmented.radius : radius.round;

export function ProfileShell({
  identity,
  tabs,
  options,
  tab,
  onTab,
  body,
  onClose,
}: {
  identity: ReactNode;
  tabs: readonly ProfileTab[];
  options: readonly IconTabOption<ProfileTab>[];
  tab: ProfileTab;
  onTab(tab: ProfileTab): void;
  body: ProfileTabBody;
  onClose(): void;
}) {
  const t = useStrings();
  const paging = useProfilePaging();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<Item>>(null);
  const offset = useSharedValue(0);
  const [identityHeight, setIdentityHeight] = useState(0);
  const showTabs = tabs.length > 1;

  const fade = useSharedValue(1);
  const select = (next: ProfileTab) => {
    if (next === tab) return;
    fade.value = 0;
    fade.value = withSpring(1, spring.effects.default);
    if (offset.value > identityHeight)
      list.current?.scrollToOffset({ offset: identityHeight, animated: false });
    onTab(next);
  };
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.value = event.nativeEvent.contentOffset.y;
  };

  const step = (forward: boolean) => {
    const next = swipedTab(tabs, tab, forward);
    if (next !== undefined) select(next);
  };
  const direction = I18nManager.isRTL ? -1 : 1;
  const swipe = Gesture.Pan()
    .enabled(showTabs && paging === undefined)
    .activeOffsetX([-swipeRow.start, swipeRow.start])
    .failOffsetY([-swipeRow.verticalFail, swipeRow.verticalFail])
    .onEnd((event) => {
      const travel = event.translationX * direction;
      const velocity = event.velocityX * direction;
      if (Math.abs(travel) < width / 4 && Math.abs(velocity) < swipeRow.flick) return;
      runOnJS(step)(travel < 0);
    });

  const items: Item[] = [
    { kind: 'identity', key: 'identity' },
    ...(showTabs ? [{ kind: 'tabs' as const, key: 'tabs' as const }] : []),
    { kind: 'top', key: `${tab}:top` },
    ...(body.rows.length === 0
      ? body.empty === undefined
        ? []
        : [{ kind: 'empty' as const, key: `${tab}:empty` }]
      : body.rows.map((row) => ({
          kind: 'row' as const,
          key: `${tab}:${row.key}`,
          row,
        }))),
    ...(body.footer === undefined ? [] : [{ kind: 'footer' as const, key: `${tab}:footer` }]),
  ];
  const content = (node: ReactNode) => (
    <Animated.View style={[{ paddingHorizontal: space.x5 }, fadeStyle]}>{node}</Animated.View>
  );
  const render = (item: Item) => {
    switch (item.kind) {
      case 'identity':
        return (
          <View onLayout={(event) => setIdentityHeight(event.nativeEvent.layout.height)}>
            {identity}
          </View>
        );
      case 'tabs':
        return (
          <View
            style={{
              paddingHorizontal: space.x5,
              paddingVertical: space.x3,
              backgroundColor: theme.overlay.fill,
            }}
          >
            <View
              testID="profile-tabs-plate"
              style={{
                borderRadius: tabsRadius,
                backgroundColor: theme.overlay.fill,
              }}
            >
              <IconTabs
                label={t.profileTabsLabel}
                options={options}
                value={tab}
                onChange={select}
              />
            </View>
          </View>
        );
      case 'top':
        return content(
          <View
            testID={`profile-tab-content-${tab}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.x3,
              paddingTop: space.x2,
              paddingBottom: body.action === undefined ? 0 : space.x1,
            }}
          >
            {body.action === undefined ? null : (
              <>
                <Text testID="profile-tab-heading" accessibilityRole="header" strong>
                  {t.profileTabs[tab]}
                </Text>
                {body.action}
              </>
            )}
          </View>,
        );
      case 'row':
        return content(item.row.render());
      case 'empty':
        return content(body.empty);
      case 'footer':
        return content(body.footer);
    }
  };

  return (
    <View
      testID="profile-page"
      onAccessibilityEscape={onClose}
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
    >
      {Platform.OS === 'ios' ? (
        <View style={{ height: headerHeight + space.x3, backgroundColor: theme.overlay.fill }} />
      ) : (
        <View
          style={{
            paddingTop: insets.top + space.x2,
            paddingHorizontal: space.x4,
            paddingBottom: space.x3,
            alignItems: 'flex-start',
            backgroundColor: theme.overlay.fill,
          }}
        >
          <HeaderCircleButton testID="profile-back" label={t.back} onPress={onClose}>
            <BackIcon color={theme.color.fg} size={theme.type.title.line} />
          </HeaderCircleButton>
        </View>
      )}
      <GestureDetector gesture={swipe}>
        <View style={{ flex: 1 }}>
          <AnimatedList
            ref={list}
            testID="profile-list"
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => render(item)}
            stickyHeaderIndices={showTabs ? [1] : undefined}
            onScroll={onScroll}
            scrollEventThrottle={16}
            nestedScrollEnabled
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + space.x6 }}
            style={{ flex: 1 }}
          />
        </View>
      </GestureDetector>
      {body.overlay}
    </View>
  );
}
