import { useState, type ReactNode } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';
import { Tabs, type TabBarProps } from 'react-native-collapsible-tab-view';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useIsFocused } from 'expo-router';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { systemSegmented } from '../design/system-shape';
import { IconTabs, type IconTabOption } from '../primitives/icon-tabs';
import { Text } from '../primitives/text';
import { BackIcon } from '../shell/back-icon';
import { useStrings } from '../strings';
import { useMounted } from '../mounted';
import { HeaderCircleButton } from './header-chrome';
import type { ProfileTab } from './profile-tabs';
import { createProfilePagerSelection } from './profile-pager-selection';

export type ProfileRow = { key: string; render(): ReactNode };

export type ProfileTabBody = {
  rows: readonly ProfileRow[];
  action?: ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
};

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
  body(tab: ProfileTab): ProfileTabBody;
  onClose(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const focused = useIsFocused();
  const [selection] = useState(() => createProfilePagerSelection(tab));
  const showTabs = tabs.length > 1;
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
      <Tabs.Container
        containerStyle={{ overflow: 'hidden' }}
        initialTabName={tab}
        lazy={false}
        cancelLazyFadeIn
        headerContainerStyle={{
          backgroundColor: theme.overlay.fill,
          elevation: 0,
          shadowOpacity: 0,
        }}
        renderHeader={() => <View pointerEvents="box-none">{identity}</View>}
        {...(showTabs ? {} : { tabBarHeight: 0 })}
        renderTabBar={
          showTabs
            ? (pager) => (
                <ProfileTabStrip
                  pager={pager}
                  tabs={tabs}
                  options={options}
                  tab={tab}
                  onTab={onTab}
                  selection={selection}
                />
              )
            : () => null
        }
        pagerProps={{
          testID: 'profile-pager',
          scrollEnabled: showTabs,
          overScrollMode: 'never',
          overdrag: false,
          offscreenPageLimit: tabs.length,
          onPageSelected: ({ nativeEvent }) => {
            const next = tabs[nativeEvent.position];
            if (next === undefined) return;
            const accepted = selection.settle(next);
            if (accepted && focused && next !== tab) onTab(next);
          },
          onPageScrollStateChanged: ({ nativeEvent }) => {
            if (nativeEvent.pageScrollState === 'dragging') {
              const current = selection.drag();
              if (focused && current !== tab) onTab(current);
            }
          },
        }}
      >
        {tabs.map((page) => (
          <Tabs.Tab key={page} name={page}>
            <ProfilePage tab={page} selected={page === tab} body={body(page)} />
          </Tabs.Tab>
        ))}
      </Tabs.Container>
      {body(tab).overlay}
    </View>
  );
}

function ProfileTabStrip({
  pager,
  tabs,
  options,
  tab,
  onTab,
  selection,
}: {
  pager: TabBarProps;
  tabs: readonly ProfileTab[];
  options: readonly IconTabOption<ProfileTab>[];
  tab: ProfileTab;
  onTab(tab: ProfileTab): void;
  selection: ReturnType<typeof createProfilePagerSelection>;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const mount = useMounted<ViewInstance>(() => {
    if (!selection.choose(tab)) return;
    pager.containerRef.current?.setPageWithoutAnimation(tabs.indexOf(tab));
  }, [tab, tabs, pager.containerRef, selection]);
  return (
    <View
      ref={mount}
      style={{
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: theme.overlay.fill,
      }}
    >
      <View
        testID="profile-tabs-plate"
        style={{ borderRadius: tabsRadius, backgroundColor: theme.overlay.fill }}
      >
        <IconTabs
          label={t.profileTabsLabel}
          options={options}
          value={tab}
          onChange={(next) => {
            const accepted = selection.choose(next);
            if (!accepted) return;
            onTab(next);
            if (reduced) pager.containerRef.current?.setPageWithoutAnimation(tabs.indexOf(next));
            else pager.containerRef.current?.setPage(tabs.indexOf(next));
          }}
        />
      </View>
    </View>
  );
}

function ProfilePage({
  tab,
  selected,
  body,
}: {
  tab: ProfileTab;
  selected: boolean;
  body: ProfileTabBody;
}) {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const content = (node: ReactNode) => <View style={{ paddingHorizontal: space.x5 }}>{node}</View>;
  return (
    <Tabs.FlatList
      testID={`profile-list-${tab}`}
      accessibilityElementsHidden={!selected}
      importantForAccessibility={selected ? 'auto' : 'no-hide-descendants'}
      data={body.rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => content(item.render())}
      ListHeaderComponent={content(
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
      )}
      ListEmptyComponent={body.empty === undefined ? <></> : content(body.empty)}
      ListFooterComponent={body.footer === undefined ? <></> : content(body.footer)}
      initialNumToRender={4}
      maxToRenderPerBatch={6}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: insets.bottom + space.x6 }}
    />
  );
}
