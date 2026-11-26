import { useState, type ReactElement } from 'react';
import { Keyboard, Platform, Pressable, SectionList, View, type ViewProps } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { useHideChromeOnScroll } from '../../ui/shell/tab-chrome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOST_SESSION_SEARCH_MAX } from '@botharness/host-protocol/host-sessions';
import { SheetLoading } from '../../ui/chat/sheet';
import { capsuleRadius } from '../../ui/design/large-text-fallback';
import { pressTint, useDesignTheme } from '../../ui/design/theme';
import { glassPress, radius, space } from '../../ui/design/tokens';
import { KeyboardFormFooter } from '../../ui/primitives/keyboard-form-footer';
import { ReadFailure } from '../../ui/primitives/read-failure';
import { SearchField } from '../../ui/primitives/search-field';
import { Text } from '../../ui/primitives/text';
import type { SessionQueryRow } from './session-query-model';
import { SessionDrawerRow } from './session-drawer-row';
import { SessionDrawerEnvironmentChip } from './session-drawer-environment-chip';
import { SessionDrawerFooterActions } from './session-drawer-footer-actions';
import { EdgeBar, edgeBars } from './session-drawer-edge';
import { ActivitySearchIcon, PencilIcon } from '../../ui/shell/icons';
import { useStrings } from '../../ui/strings';
import { sessionDrawerSections, type SessionDrawerGroup } from './session-drawer-model';
import { SessionOptionsMenu } from './session-options-menu';
import { HeaderCircleButton } from '../../ui/chat/header-chrome';
import { useFloatingTabInset } from '../../ui/shell/floating-tab-inset';
import { NavigationAction } from '../../ui/shell/navigation-action';
import { useWindowInsets } from '../../ui/shell/window-insets';
import { useSessionQuery, type SessionQueryHost } from './use-session-query';

export type SessionDrawerPanelProps = {
  hosts: readonly SessionQueryHost[];
  title: string;
  environmentHostId?: string | undefined;
  showHost: boolean;
  active: boolean;
  selected?: { hostId: string; sessionId: string } | undefined;
  canCreate: boolean;
  onOpen(row: SessionQueryRow): void;
  onNew(): void;
  variant?: 'drawer' | 'page';
};

const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList<SessionQueryRow, { group: SessionDrawerGroup; data: SessionQueryRow[] }>,
);

export function SessionDrawerPanel({
  hosts,
  title,
  environmentHostId,
  showHost,
  active,
  selected,
  canCreate,
  onOpen,
  onNew,
  variant = 'drawer',
}: SessionDrawerPanelProps) {
  const page = variant === 'page';
  const tabInset = useFloatingTabInset();
  const strings = useStrings();
  const t = strings.hostSessions;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const windowInsets = useWindowInsets();
  const query = useSessionQuery(hosts, active);
  const [searching, setSearching] = useState(false);
  const floating = !page && edgeBars;
  const compactFooter = floating || Platform.OS === 'android';
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const hideChrome = useHideChromeOnScroll(page && !searching);
  const sections = sessionDrawerSections(query.rows ?? [], query.sort, Date.now());
  const closeSearch = () => {
    query.changeSearch('');
    setSearching(false);
    Keyboard.dismiss();
  };
  const searchBlock = searching ? (
    <SearchField
      testID="session-drawer-search-field"
      {...(floating ? { floating: true } : { capsule: true })}
      autoFocus
      inset={0}
      value={query.draft}
      placeholder={t.search}
      maxLength={HOST_SESSION_SEARCH_MAX}
      onChangeText={(text) => query.changeSearch(text)}
      onSubmitEditing={(text) => {
        query.changeSearch(text, true);
        Keyboard.dismiss();
      }}
      onClose={closeSearch}
      trailing={
        Platform.OS === 'android' ? null : (
          <NavigationAction
            close
            size={theme.touch}
            label={strings.closeSearch}
            testID="session-drawer-search-close"
            onPress={closeSearch}
          />
        )
      }
    />
  ) : (
    <Pressable
      testID="session-drawer-search"
      accessibilityRole="search"
      accessibilityLabel={t.search}
      disabled={!query.canQuery}
      onPress={() => setSearching(true)}
      android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: space.x4,
        borderRadius: capsuleRadius(theme.fontScale),
        overflow: 'hidden',
        opacity: query.canQuery ? 1 : 0.5,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <ActivitySearchIcon
        color={theme.color.subtle}
        size={theme.type.body.size * theme.fontScale}
      />
      <Text tone={query.search ? 'fg' : 'subtle'} numberOfLines={1} style={{ flex: 1 }}>
        {query.search || t.search}
      </Text>
    </Pressable>
  );
  return (
    <PanelRoot
      floating={floating}
      keyboardOffset={space.x2 - windowInsets.bottom}
      testID={page ? 'session-list' : 'session-drawer'}
      style={{ flex: 1, paddingTop: floating ? 0 : insets.top }}
    >
      <EdgeBar
        edge="top"
        onLayout={
          floating ? (event) => setHeaderHeight(event.nativeEvent.layout.height) : undefined
        }
        style={{
          ...(floating
            ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, paddingTop: insets.top }
            : {}),
          minHeight: theme.touch + space.x2 * 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingLeft: space.x5,
          paddingRight: page ? space.x4 : space.x3,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <SessionDrawerEnvironmentChip title={title} hostId={environmentHostId} />
        </View>
        {query.canQuery ? (
          <SessionOptionsMenu active={query.optionsActive} groups={query.groups} />
        ) : null}
        {page && canCreate ? (
          <HeaderCircleButton label={t.create} testID="session-list-new" onPress={onNew}>
            <PencilIcon color={theme.color.fg} size={theme.type.title.line} />
          </HeaderCircleButton>
        ) : null}
      </EdgeBar>
      {page ? (
        <View style={{ paddingHorizontal: space.x4, paddingBottom: space.x2 }}>{searchBlock}</View>
      ) : null}
      <EdgeEffects floating={floating}>
        <AnimatedSectionList
          testID="session-drawer-list"
          onScroll={hideChrome}
          scrollEventThrottle={1}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: space.x3,
            paddingTop: floating ? headerHeight : 0,
            paddingBottom: page ? tabInset : floating ? footerHeight + space.x3 : space.x3,
          }}
          scrollIndicatorInsets={floating ? { top: headerHeight, bottom: footerHeight } : undefined}
          sections={sections}
          keyExtractor={(row) => `${row.hostId}:${row.sessionId}`}
          onEndReached={query.loadMore}
          onEndReachedThreshold={0.5}
          refreshing={query.online && query.pullRefreshing}
          onRefresh={query.online ? () => query.refresh('pull') : undefined}
          renderSectionHeader={({ section }) => (
            <Text
              variant="meta"
              tone="muted"
              accessibilityRole="header"
              style={{ paddingHorizontal: space.x3, paddingTop: space.x4, paddingBottom: space.x2 }}
            >
              {t.groups[section.group]}
            </Text>
          )}
          ListHeaderComponent={
            query.failed && query.rows !== undefined ? (
              <ReadFailure
                title={t.loadFailed}
                onRetry={query.refresh}
                busy={query.busy}
                disabled={!query.online}
              />
            ) : undefined
          }
          ListEmptyComponent={
            !query.online ? (
              <Text tone="muted" style={{ padding: space.x3 }}>
                {t.offline}
              </Text>
            ) : query.failed && query.searchReady ? (
              <ReadFailure title={t.loadFailed} onRetry={query.refresh} busy={query.busy} />
            ) : query.rows === undefined ? (
              <SheetLoading />
            ) : (
              <Text tone="muted" style={{ padding: space.x3 }}>
                {query.search || query.source !== 'all' ? t.noMatches : t.empty}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <SessionDrawerRow
              row={item}
              client={hosts.find((host) => host.hostId === item.hostId)?.client}
              showHost={showHost}
              selected={item.hostId === selected?.hostId && item.sessionId === selected.sessionId}
              onPress={() => onOpen(item)}
            />
          )}
        />
      </EdgeEffects>
      {page ? null : (
        <View
          onLayout={
            floating ? (event) => setFooterHeight(event.nativeEvent.layout.height) : undefined
          }
          style={floating ? { position: 'absolute', left: 0, right: 0, bottom: 0 } : undefined}
        >
          <FooterKeyboard floating={floating} bottomInset={windowInsets.bottom}>
            <EdgeBar edge="bottom">
              <View
                testID="session-drawer-footer"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x3,
                  paddingHorizontal: space.x4,
                  paddingTop: space.x2,
                  paddingBottom: Math.max(windowInsets.bottom, space.x4),
                }}
              >
                {compactFooter && !searching ? (
                  <SessionDrawerFooterActions
                    searchLabel={t.search}
                    createLabel={t.create}
                    canSearch={query.canQuery}
                    canCreate={canCreate}
                    onSearch={() => setSearching(true)}
                    onCreate={onNew}
                  />
                ) : (
                  <>
                    <View style={{ flex: 1 }}>{searchBlock}</View>
                    {canCreate && !searching ? (
                      <Pressable
                        testID="session-drawer-new"
                        accessibilityRole="button"
                        accessibilityLabel={t.create}
                        onPress={onNew}
                        style={({ pressed }) => ({
                          width: theme.touch,
                          height: theme.touch,
                          borderRadius: radius.round,
                          overflow: 'hidden',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.color.fg,
                          opacity: pressed ? glassPress.dim : 1,
                        })}
                      >
                        <PencilIcon color={theme.color.base} size={theme.type.title.line} />
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            </EdgeBar>
          </FooterKeyboard>
        </View>
      )}
    </PanelRoot>
  );
}

function PanelRoot({
  floating,
  keyboardOffset,
  ...props
}: ViewProps & { floating: boolean; keyboardOffset: number }) {
  return floating ? (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={keyboardOffset}
      style={{ flex: 1 }}
    >
      <View {...props} />
    </KeyboardAvoidingView>
  ) : (
    <View {...props} />
  );
}

function FooterKeyboard({
  floating,
  bottomInset,
  children,
}: {
  floating: boolean;
  bottomInset: number;
  children: ReactElement;
}) {
  return floating ? (
    children
  ) : (
    <KeyboardFormFooter bottomInset={bottomInset}>{children}</KeyboardFormFooter>
  );
}

function EdgeEffects({ floating, children }: { floating: boolean; children: ReactElement }) {
  return floating ? (
    <ScrollViewMarker
      style={{ flex: 1 }}
      scrollEdgeEffects={{ top: 'soft', bottom: 'soft', left: 'hidden', right: 'hidden' }}
    >
      {children}
    </ScrollViewMarker>
  ) : (
    children
  );
}
