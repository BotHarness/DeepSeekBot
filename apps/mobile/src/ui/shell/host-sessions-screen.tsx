import { Redirect, Stack, useRouter, type NativeStackHeaderItem } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, Platform, Pressable, View } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import {
  HOST_SESSION_SEARCH_MAX,
  type HostSessionRow,
} from '@botharness/host-protocol/host-sessions';
import { HostSessionListItem } from '../../features/sessions/session-row';
import { useSessionQuery } from '../../features/sessions/use-session-query';
import { useHostSession } from '../../host/host-session';
import { BotPortrait } from '../bot-avatar';
import { SheetLoading } from '../chat/sheet';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useSessionsTab } from '../interface-preferences';
import { ReadFailure } from '../primitives/read-failure';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useFloatingTabInset } from './floating-tab-inset';
import { HeaderAction } from './header-action';
import { HeaderIconButton } from './header-icon-button';
import { HeaderSearch } from './header-search';
import { HostSessionOptionsSheet } from './host-session-options';
import { HostSessionOptionsButton } from './host-session-options-button';
import { openNewSession } from '../../features/sessions/session-drawer-navigation';
import { canCreateNativeSession, sessionHref } from './page-create-actions';
import { TabPageHeader } from './tab-page-header';
import { TabNativeHeader } from './tab-native-header';
import { AssignmentSessionIcon, ChevronRightIcon } from './icons';

export function HostSessionsScreen() {
  const enabled = useSessionsTab();
  const { client, saved } = useHostSession();
  const t = useStrings().hostSessions;
  const nativeHeader = Platform.OS === 'ios';
  if (!enabled) return <Redirect href="/" />;
  if (client && saved)
    return (
      <HostSessionsList
        key={`${saved.hostId}:${saved.deviceId}`}
        client={client}
        hostId={saved.hostId}
        canCreate={canCreateNativeSession(saved)}
      />
    );
  return (
    <>
      {nativeHeader ? (
        <TabNativeHeader title={t.title} leading={<SessionsTitle />} />
      ) : (
        <>
          <Stack.Screen options={{ title: t.title, headerShown: false }} />
          <TabPageHeader testID="host-sessions-header" leading={<SessionsTitle />} />
        </>
      )}
      <Text tone="muted" style={{ padding: space.x5 }}>
        {t.offline}
      </Text>
    </>
  );
}

function SessionsTitle() {
  const t = useStrings().hostSessions;
  return (
    <Text variant="title" strong accessibilityRole="header">
      {t.title}
    </Text>
  );
}

function HostSessionsList({
  client,
  hostId,
  canCreate,
}: {
  client: HostClient;
  hostId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const t = useStrings().hostSessions;
  const nativeHeader = Platform.OS === 'ios';
  const theme = useDesignTheme();
  const bottom = useFloatingTabInset();
  const query = useSessionQuery(
    useMemo(() => [{ hostId, hostName: '', client }], [client, hostId]),
  );
  const {
    source,
    draft,
    search,
    searchReady,
    rows,
    failed,
    busy,
    online,
    pullRefreshing,
    groups,
    canQuery,
    optionsActive,
    changeSearch,
    refresh,
  } = query;
  const [searchOpen, setSearchOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const open = (row: HostSessionRow) => router.push(sessionHref(row, hostId));
  const optionsItem: NativeStackHeaderItem = {
    type: 'menu',
    label: t.options,
    accessibilityLabel: t.options,
    identifier: 'host-sessions-options',
    icon: { type: 'sfSymbol', name: 'line.3.horizontal.decrease' },
    sharesBackground: true,
    ...(optionsActive ? { tintColor: theme.color.accent } : {}),
    menu: {
      items: groups.map((group) => ({
        type: 'submenu',
        inline: true,
        label: group.label,
        items: group.choices.map((choice) => ({
          type: 'action',
          label: choice.label,
          state: choice.id === group.selected ? 'on' : 'off',
          onPress: choice.select,
        })),
      })),
    },
  };
  const createItem: NativeStackHeaderItem = {
    type: 'button',
    label: t.create,
    accessibilityLabel: t.create,
    identifier: 'session-create',
    icon: { type: 'sfSymbol', name: 'square.and.pencil' },
    sharesBackground: true,
    onPress: openNewSession,
  };
  return (
    <>
      {nativeHeader ? (
        <>
          <TabNativeHeader
            title={t.title}
            leading={theme.largeText ? null : <SessionsTitle />}
            search={
              canQuery
                ? {
                    placeholder: t.search,
                    label: t.search,
                    value: draft,
                    onChange: (text) => changeSearch(text.slice(0, HOST_SESSION_SEARCH_MAX)),
                    onCancel: () => changeSearch(''),
                    onSubmit: (text) => {
                      changeSearch(text.slice(0, HOST_SESSION_SEARCH_MAX), true);
                      Keyboard.dismiss();
                    },
                  }
                : undefined
            }
            items={[...(canQuery ? [optionsItem] : []), ...(canCreate ? [createItem] : [])]}
          />
          {theme.largeText ? (
            <View
              testID="host-sessions-header"
              style={{ paddingHorizontal: space.x5, paddingVertical: space.x2 }}
            >
              <SessionsTitle />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Stack.Screen options={{ title: t.title, headerShown: false }} />
          <TabPageHeader
            testID="host-sessions-header"
            leading={
              searchOpen ? (
                <HeaderSearch
                  testID="host-sessions-query"
                  value={draft}
                  placeholder={t.search}
                  maxLength={HOST_SESSION_SEARCH_MAX}
                  onChangeText={changeSearch}
                  onSubmitEditing={(text) => {
                    changeSearch(text, true);
                    Keyboard.dismiss();
                    setSearchOpen(false);
                  }}
                  onClose={() => setSearchOpen(false)}
                />
              ) : (
                <SessionsTitle />
              )
            }
            actions={
              searchOpen || (!canQuery && !canCreate) ? undefined : (
                <>
                  {canQuery ? (
                    <>
                      <HeaderAction
                        icon="search"
                        label={t.search}
                        testID="host-sessions-search"
                        active={search !== ''}
                        onPress={() => setSearchOpen(true)}
                      />
                      <HostSessionOptionsButton
                        active={optionsActive}
                        groups={groups}
                        onOpen={() => setOptionsOpen(true)}
                      />
                    </>
                  ) : null}
                  {canCreate ? (
                    <HeaderIconButton
                      icon="edit"
                      label={t.create}
                      testID="session-create"
                      onPress={openNewSession}
                    />
                  ) : null}
                </>
              )
            }
          />
        </>
      )}
      <FlatList
        testID="host-sessions-list"
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space.x4,
          paddingBottom: bottom,
        }}
        data={rows}
        keyExtractor={(row) => row.sessionId}
        refreshing={online && pullRefreshing}
        onRefresh={online ? () => refresh('pull') : undefined}
        ListHeaderComponent={
          failed && rows !== undefined ? (
            <ReadFailure title={t.loadFailed} onRetry={refresh} busy={busy} disabled={!online} />
          ) : undefined
        }
        ListEmptyComponent={
          !online ? (
            <Text tone="muted" style={{ padding: space.x3 }}>
              {t.offline}
            </Text>
          ) : failed && searchReady ? (
            <ReadFailure title={t.loadFailed} onRetry={refresh} busy={busy} />
          ) : rows === undefined ? (
            <SheetLoading />
          ) : (
            <Text tone="muted" style={{ padding: space.x3 }}>
              {search || source !== 'all' ? t.noMatches : t.empty}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <HostSessionListItem row={item} client={client} onPress={() => open(item)} />
        )}
      />
      <HostSessionOptionsSheet
        open={optionsOpen}
        groups={groups}
        onClose={() => setOptionsOpen(false)}
      />
    </>
  );
}
