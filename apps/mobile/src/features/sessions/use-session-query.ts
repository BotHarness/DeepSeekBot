import { useInfiniteQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import {
  HOST_SESSION_SORTS,
  type HostSessionFilter,
} from '@botharness/host-protocol/host-sessions';
import {
  interfacePreferences,
  useHideBotSessions,
  useSessionSort,
} from '../../ui/interface-preferences';
import type { SessionOptionGroup } from '../../ui/shell/host-session-options';
import { useStrings } from '../../ui/strings';
import {
  nextSessionCursors,
  readSessionListPage,
  sessionListKey,
  sessionListPartlyFailed,
  sessionListRows,
  sessionListSources,
  sessionQueries,
  type SessionCursors,
} from './session-list-query';

export type SessionQueryHost = { hostId: string; hostName: string; client: HostClient };

function onlineSource(hosts: readonly SessionQueryHost[]) {
  return {
    subscribe(listener: () => void) {
      const stops = hosts.map((host) => host.client.subscribe(listener));
      return () => {
        for (const stop of stops) stop();
      };
    },
    getSnapshot: () =>
      hosts.some((host) => host.client.getSnapshot().connection.status === 'connected'),
  };
}

export function useSessionQuery(hosts: readonly SessionQueryHost[], active = true) {
  const t = useStrings().hostSessions;
  const sort = useSessionSort();
  const hideBots = useHideBotSessions();
  const [chosenSource, setSource] = useState<HostSessionFilter>('all');
  const source: HostSessionFilter =
    hideBots && chosenSource.startsWith('bot:') ? 'all' : chosenSource;
  const [draft, setDraft] = useState('');
  const [debounced, setDebounced] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSearch = useRef('');
  const search = draft.trim();
  const searchReady = search === '' || search === debounced;
  const online = useOnline(hosts);
  const options = { sort, source, search };
  const hostIds = hosts.map((host) => host.hostId);
  const list = useInfiniteQuery(
    {
      queryKey: sessionListKey(hostIds, options),
      queryFn: ({ pageParam, signal }) => readSessionListPage(hosts, options, pageParam, signal),
      initialPageParam: undefined as SessionCursors | undefined,
      getNextPageParam: nextSessionCursors,
      enabled: active && online && searchReady && hosts.length > 0,
    },
    sessionQueries,
  );
  const read = sessionListRows(list.data, hosts);
  const rows = hideBots ? read?.filter((row) => row.source.kind !== 'bot') : read;
  const sources = sessionListSources(list.data);
  const failed = list.isError || sessionListPartlyFailed(list.data);
  const [pulling, setPulling] = useState(false);

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

  const enabled = active && online && searchReady;
  const refetch = list.refetch;
  const refresh = useCallback(
    (origin?: 'pull') => {
      if (!enabled) return;
      if (origin === 'pull') setPulling(true);
      void refetch({ cancelRefetch: false }).finally(() => setPulling(false));
    },
    [enabled, refetch],
  );
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const loadMore = () => {
    if (enabled && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  };

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
          .filter((item) => !hideBots || item.kind !== 'bot')
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
    {
      id: 'bots',
      label: t.botSessionsLabel,
      selected: hideBots ? 'hide' : 'show',
      choices: [
        {
          id: 'show',
          label: t.botSessionsShow,
          select: () => interfacePreferences.setHideBotSessions(false),
        },
        {
          id: 'hide',
          label: t.botSessionsHide,
          select: () => interfacePreferences.setHideBotSessions(true),
        },
      ],
    },
  ];

  return {
    sort,
    source,
    draft,
    search,
    searchReady,
    rows,
    failed,
    busy: list.isFetching,
    online,
    pullRefreshing: pulling && list.isFetching,
    hasMore: list.hasNextPage,
    loadingMore: list.isFetchingNextPage,
    loadMore,
    groups,
    canQuery: online && sources !== undefined,
    optionsActive: sort !== 'last-human-turn' || source !== 'all' || hideBots,
    changeSearch,
    refresh,
  };
}

function useOnline(hosts: readonly SessionQueryHost[]): boolean {
  const source = useMemo(() => onlineSource(hosts), [hosts]);
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

export type SessionQuery = ReturnType<typeof useSessionQuery>;
