import { Redirect, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, Keyboard, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HostClient } from '@botharness/host-client/client';
import { readHostSessionList } from '@botharness/host-client/host-sessions';
import {
  HOST_SESSION_SEARCH_MAX,
  HOST_SESSION_SORTS,
  type HostSessionFilter,
  type HostSessionRow,
  type HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import { useHostSession } from '../../host/host-session';
import { sessionReadHost } from '../../host/session-detail';
import { BotPortrait } from '../bot-avatar';
import { SheetLoading } from '../chat/sheet';
import { pressTint, useDesignTheme } from '../design/theme';
import { materialSearchHeight } from '../design/material-search';
import { radius, space, tabHeader } from '../design/tokens';
import { interfacePreferences, useSessionsTab, useSessionSort } from '../interface-preferences';
import { ReadFailure } from '../primitives/read-failure';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useFloatingTabInset } from './floating-tab-inset';
import { HeaderAction } from './header-action';
import { HeaderSearch } from './header-search';
import {
  HostSessionOptionsButton,
  HostSessionOptionsSheet,
  type SessionOptionGroup,
} from './host-session-options';
import { AssignmentSessionIcon, ChevronRightIcon } from './icons';

export function HostSessionsScreen() {
  const enabled = useSessionsTab();
  const { client, saved } = useHostSession();
  const t = useStrings().hostSessions;
  if (!enabled) return <Redirect href="/" />;
  if (client && saved)
    return (
      <HostSessionsList
        key={`${saved.hostId}:${saved.deviceId}`}
        client={client}
        hostId={saved.hostId}
      />
    );
  return (
    <>
      <Stack.Screen options={{ title: t.title, headerLargeTitleEnabled: false }} />
      <Text tone="muted" style={{ padding: space.x5 }}>
        {t.offline}
      </Text>
    </>
  );
}

function HostSessionsList({ client, hostId }: { client: HostClient; hostId: string }) {
  const router = useRouter();
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const bottom = useFloatingTabInset();
  const sort = useSessionSort();
  const [source, setSource] = useState<HostSessionFilter>('all');
  const [sources, setSources] = useState<HostSessionSourceOption[]>();
  const [draft, setDraft] = useState('');
  const [debounced, setDebounced] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSearch = useRef('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [result, setResult] = useState<{
    search: string;
    source: HostSessionFilter;
    rows: HostSessionRow[];
  }>();
  const search = draft.trim();
  const searchReady = search === '' || search === debounced;
  const rows = result?.search === search && result.source === source ? result.rows : undefined;
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const flight = useRef<AbortController>(undefined);
  const online = useSyncExternalStore(
    client.subscribe,
    () => client.getSnapshot().connection.status === 'connected',
  );

  const changeSearch = (text: string, immediate = false) => {
    setDraft(text);
    clearTimeout(debounceTimer.current);
    const query = text.trim();
    pendingSearch.current = query;
    if (query === '' || immediate) setDebounced(query);
    else debounceTimer.current = setTimeout(() => setDebounced(query), 250);
  };
  useFocusEffect(
    useCallback(() => {
      setDebounced(pendingSearch.current);
      return () => clearTimeout(debounceTimer.current);
    }, []),
  );

  const refresh = useCallback(() => {
    if (!online || !searchReady || flight.current !== undefined) return;
    const abort = new AbortController();
    flight.current = abort;
    setFailed(false);
    setBusy(true);
    void readHostSessionList(sessionReadHost(client, abort.signal), { search, sort, source })
      .then(
        (value) => {
          if (abort.signal.aborted) return;
          setResult({ search, source, rows: value.sessions });
          setSources(value.sources);
        },
        () => {
          if (!abort.signal.aborted) setFailed(true);
        },
      )
      .finally(() => {
        if (flight.current !== abort) return;
        flight.current = undefined;
        setBusy(false);
      });
  }, [client, online, search, searchReady, sort, source]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        flight.current?.abort();
        flight.current = undefined;
        setBusy(false);
      };
    }, [refresh]),
  );

  const groups: SessionOptionGroup[] = [
    {
      id: 'sort',
      label: t.sortLabel,
      selected: sort,
      choices: HOST_SESSION_SORTS.map((id) => ({
        id,
        label: t.sort[id],
        select: () => interfacePreferences.setSessionSort(id),
      })),
    },
    {
      id: 'source',
      label: t.sourceLabel,
      selected: source,
      choices: [
        { id: 'all', label: t.all, select: () => setSource('all') },
        ...(sources ?? [])
          .toSorted((a, b) => {
            if (a.kind === 'native') return b.kind === 'native' ? 0 : -1;
            if (b.kind === 'native') return 1;
            return a.displayName.localeCompare(b.displayName) || a.botSlug.localeCompare(b.botSlug);
          })
          .map((item) => {
            const id: HostSessionFilter = item.kind === 'native' ? 'native' : `bot:${item.botSlug}`;
            return {
              id,
              label: item.kind === 'native' ? t.nativeSource : item.displayName,
              select: () => setSource(id),
            };
          }),
      ],
    },
  ];

  const open = (row: HostSessionRow) => {
    router.push({
      pathname: '/session/[id]',
      params: {
        id: row.sessionId,
        hostId,
        ...(row.source.kind === 'native' ? { source: 'native' } : { slug: row.source.botSlug }),
        ...(row.title === undefined ? {} : { title: row.title }),
      },
    });
  };
  return (
    <>
      <Stack.Screen
        options={{
          title: t.title,
          headerLargeTitleEnabled: false,
          headerShown: !searchOpen,
          headerRight: () =>
            online && sources !== undefined ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
                <HostSessionOptionsButton
                  active={sort !== 'last-human-turn' || source !== 'all'}
                  groups={groups}
                  onOpen={() => setOptionsOpen(true)}
                />
                <HeaderAction
                  icon="search"
                  label={t.search}
                  testID="host-sessions-search"
                  active={search !== ''}
                  onPress={() => setSearchOpen(true)}
                />
              </View>
            ) : null,
        }}
      />
      {searchOpen ? (
        <View
          style={{
            paddingTop: insets.top,
            paddingHorizontal: tabHeader.gutter,
            paddingBottom: space.x2,
          }}
        >
          <View
            style={{
              minHeight:
                Platform.OS === 'android' ? materialSearchHeight(theme.fontScale) : theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <HeaderSearch
              testID="host-sessions-query"
              value={draft}
              placeholder={t.search}
              maxLength={HOST_SESSION_SEARCH_MAX}
              onChangeText={changeSearch}
              onFocusChange={(focused) => {
                if (!focused && Platform.OS === 'ios') setSearchOpen(false);
              }}
              onSubmitEditing={(text) => {
                changeSearch(text, true);
                Keyboard.dismiss();
                setSearchOpen(false);
              }}
              onClose={() => setSearchOpen(false)}
            />
          </View>
        </View>
      ) : null}
      <FlatList
        testID="host-sessions-list"
        contentInsetAdjustmentBehavior={searchOpen ? 'never' : 'automatic'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.x4, paddingBottom: bottom }}
        data={rows}
        keyExtractor={(row) => row.sessionId}
        refreshing={online && busy && rows !== undefined}
        onRefresh={online ? refresh : undefined}
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

function HostSessionListItem({
  row,
  client,
  onPress,
}: {
  row: HostSessionRow;
  client: HostClient;
  onPress(): void;
}) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const title = row.title ?? (row.source.kind === 'bot' ? row.source.displayName : t.untitled);
  const source = row.source.kind === 'native' ? t.native : row.source.displayName;
  const state = row.running ? t.running : t.idle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, source, row.folderName, state].filter(Boolean).join(', ')}
      testID={`host-session-${row.sessionId}`}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        borderRadius: radius.md,
        padding: space.x3,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        backgroundColor: pressed ? theme.layer.raised.inset : undefined,
      })}
    >
      {row.source.kind === 'bot' ? (
        <BotPortrait
          size={theme.touch}
          bot={{
            slug: row.source.botSlug,
            displayName: row.source.displayName,
            ...(row.source.appearance === undefined ? {} : { appearance: row.source.appearance }),
            ...(row.source.avatarSeed === undefined ? {} : { avatarSeed: row.source.avatarSeed }),
            ...(row.source.avatar === undefined
              ? {}
              : row.source.avatar.startsWith('/')
                ? { avatarSource: client.resource(row.source.avatar) }
                : { avatarUrl: row.source.avatar }),
          }}
        />
      ) : (
        <View
          style={{
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.md,
            backgroundColor: theme.layer.raised.inset,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AssignmentSessionIcon color={theme.color.muted} size={theme.type.title.line} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <Text strong>{title}</Text>
        <Text variant="meta" tone="muted">
          {[row.folderName, state].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ChevronRightIcon color={theme.color.muted} size={theme.type.meta.line} />
    </Pressable>
  );
}
