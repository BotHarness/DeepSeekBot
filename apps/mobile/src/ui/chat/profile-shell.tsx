import { useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  I18nManager,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { spring } from '../design/motion';
import { profileShell, space, swipeRow } from '../design/tokens';
import { IconTabs, type IconTabOption } from '../primitives/icon-tabs';
import { DrawerMaterial } from '../primitives/drawer-material';
import { SheetGrabber } from '../primitives/sheet-grabber';
import { Text } from '../primitives/text';
import { NavigationAction } from '../shell/navigation-action';
import { useStrings } from '../strings';
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

const IOS_VERSION = Platform.OS === 'ios' ? Number.parseInt(String(Platform.Version), 10) : 0;

export const zoomTransition = IOS_VERSION >= 18;

export const systemTransition = zoomTransition || Platform.OS === 'android';

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
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<Item>>(null);
  const offset = useSharedValue(0);
  const [identityHeight, setIdentityHeight] = useState(0);
  const [stuck, setStuck] = useState(false);
  const showTabs = tabs.length > 1;

  const opening = useSharedValue(systemTransition || reduced ? 1 : profileShell.openScale);
  const opened = useRef(false);
  const open = () => {
    if (opened.current) return;
    opened.current = true;
    opening.value = withSpring(1, spring.spatial.default);
  };
  const openingStyle = useAnimatedStyle(() => ({ transform: [{ scale: opening.value }] }));

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
    const y = event.nativeEvent.contentOffset.y;
    offset.value = y;
    const next = showTabs && identityHeight > 0 && y >= identityHeight;
    if (next !== stuck) setStuck(next);
  };
  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (systemTransition) return;
    if (event.nativeEvent.contentOffset.y < -profileShell.dismissDistance) onClose();
  };

  const step = (forward: boolean) => {
    const next = swipedTab(tabs, tab, forward);
    if (next !== undefined) select(next);
  };
  const direction = I18nManager.isRTL ? -1 : 1;
  const swipe = Gesture.Pan()
    .enabled(showTabs)
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
              backgroundColor: stuck ? 'transparent' : theme.overlay.fill,
            }}
          >
            {stuck ? <DrawerMaterial rounded glassPanel /> : null}
            <IconTabs label={t.profileTabsLabel} options={options} value={tab} onChange={select} />
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
    <Animated.View
      testID="profile-page"
      onLayout={open}
      style={[{ flex: 1, backgroundColor: theme.overlay.fill }, openingStyle]}
    >
      {Platform.OS === 'android' ? (
        <Pressable
          testID="profile-handle"
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={onClose}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: theme.touch,
            backgroundColor: theme.overlay.fill,
          }}
        >
          <SheetGrabber />
        </Pressable>
      ) : (
        <View
          style={{
            paddingTop: insets.top + space.x3,
            paddingBottom: space.x3,
            paddingHorizontal: space.x5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x4,
            backgroundColor: theme.overlay.fill,
          }}
        >
          <NavigationAction close size={theme.touch} label={t.close} onPress={onClose} />
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
            onScrollEndDrag={onScrollEndDrag}
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
    </Animated.View>
  );
}
