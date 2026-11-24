import { useState } from 'react';
import { Keyboard, Pressable, SectionList, View } from 'react-native';
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
import { ActivitySearchIcon, PencilIcon } from '../../ui/shell/icons';
import { useStrings } from '../../ui/strings';
import { sessionDrawerSections } from './session-drawer-model';
import { SessionOptionsMenu } from './session-options-menu';
import { HeaderCircleButton } from '../../ui/chat/header-chrome';
import { useFloatingTabInset } from '../../ui/shell/floating-tab-inset';
import { useSessionQuery, type SessionQueryHost } from './use-session-query';

export type SessionDrawerPanelProps = {
  hosts: readonly SessionQueryHost[];
  title: string;
  showHost: boolean;
  active: boolean;
  selected?: { hostId: string; sessionId: string } | undefined;
  canCreate: boolean;
  onOpen(row: SessionQueryRow): void;
  onNew(): void;
  variant?: 'drawer' | 'page';
};

export function SessionDrawerPanel({
  hosts,
  title,
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
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const query = useSessionQuery(hosts, active);
  const [searching, setSearching] = useState(false);
  const sections = sessionDrawerSections(query.rows ?? [], query.sort, Date.now());
  const closeSearch = () => {
    query.changeSearch('');
    setSearching(false);
    Keyboard.dismiss();
  };
  const searchBlock = searching ? (
    <SearchField
      testID="session-drawer-search-field"
      floating
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.searchCancel}
          testID="session-drawer-search-cancel"
          onPress={closeSearch}
          hitSlop={space.x2}
          style={{ minHeight: theme.touch, justifyContent: 'center' }}
        >
          <Text tone="accent">{t.searchCancel}</Text>
        </Pressable>
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
      <ActivitySearchIcon color={theme.color.subtle} size={theme.type.body.size} />
      <Text tone={query.search ? 'fg' : 'subtle'} numberOfLines={1} style={{ flex: 1 }}>
        {query.search || t.search}
      </Text>
    </Pressable>
  );
  return (
    <View
      testID={page ? 'session-list' : 'session-drawer'}
      style={{ flex: 1, paddingTop: insets.top }}
    >
      <View
        style={{
          minHeight: theme.touch + space.x2 * 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingLeft: space.x5,
          paddingRight: page ? space.x4 : space.x3,
        }}
      >
        <Text
          variant="title"
          strong
          accessibilityRole="header"
          testID="session-drawer-environment"
          numberOfLines={theme.largeText ? 2 : 1}
          style={{ flex: 1 }}
        >
          {title}
        </Text>
        {query.canQuery ? (
          <SessionOptionsMenu active={query.optionsActive} groups={query.groups} />
        ) : null}
        {page && canCreate ? (
          <HeaderCircleButton label={t.create} testID="session-list-new" onPress={onNew}>
            <PencilIcon color={theme.color.fg} size={theme.type.title.line} />
          </HeaderCircleButton>
        ) : null}
      </View>
      {page ? (
        <View style={{ paddingHorizontal: space.x4, paddingBottom: space.x2 }}>{searchBlock}</View>
      ) : null}
      <SectionList
        testID="session-drawer-list"
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: space.x3,
          paddingBottom: page ? tabInset : space.x3,
        }}
        sections={sections}
        keyExtractor={(row) => `${row.hostId}:${row.sessionId}`}
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
      {page ? null : (
        <KeyboardFormFooter>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x3,
              paddingHorizontal: space.x4,
              paddingTop: space.x2,
              paddingBottom: Math.max(insets.bottom, space.x4),
            }}
          >
            <View style={{ flex: 1 }}>{searchBlock}</View>
            {canCreate && !searching ? (
              <Pressable
                testID="session-drawer-new"
                accessibilityRole="button"
                accessibilityLabel={t.create}
                onPress={onNew}
                android_ripple={{ color: pressTint(theme.color.base), foreground: true }}
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
          </View>
        </KeyboardFormFooter>
      )}
    </View>
  );
}
