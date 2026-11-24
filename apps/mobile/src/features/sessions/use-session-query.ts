import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { readHostSessionList } from '@botharness/host-client/host-sessions';
import {
  HOST_SESSION_SORTS,
  type HostSessionFilter,
  type HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import { sessionReadHost } from '../../host/session-detail';
import {
  interfacePreferences,
  useHideBotSessions,
  useSessionSort,
} from '../../ui/interface-preferences';
import type { SessionOptionGroup } from '../../ui/shell/host-session-options';
import { useStrings } from '../../ui/strings';
import { mergeSessionRows, mergeSessionSources, type SessionQueryRow } from './session-query-model';

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
  const [sources, setSources] = useState<HostSessionSourceOption[]>();
  const [draft, setDraft] = useState('');
  const [debounced, setDebounced] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSearch = useRef('');
  const [result, setResult] = useState<{
    search: string;
    source: HostSessionFilter;
    rows: SessionQueryRow[];
  }>();
  const search = draft.trim();
  const searchReady = search === '' || search === debounced;
  const read = result?.search === search && result.source === source ? result.rows : undefined;
  const rows = hideBots ? read?.filter((row) => row.source.kind !== 'bot') : read;
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const flight = useRef<AbortController>(undefined);
  const hostKey = hosts.map((host) => host.hostId).join('\n');
  const online = useOnline(hosts, hostKey);

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

  const refresh = useCallback(
    (origin?: 'pull') => {
      if (!active || !online || !searchReady) return;
      if (origin === 'pull') setPullRefreshing(true);
      if (flight.current !== undefined) return;
      const abort = new AbortController();
      flight.current = abort;
      setFailed(false);
      setBusy(true);
      void Promise.allSettled(
        hosts.map(async (host) => ({
          host,
          value: await readHostSessionList(sessionReadHost(host.client, abort.signal), {
            search,
            sort,
            source,
          }),
        })),
      )
        .then((settled) => {
          if (abort.signal.aborted) return;
          const read = settled.flatMap((entry) =>
            entry.status === 'fulfilled' ? [entry.value] : [],
          );
          if (read.length === 0) {
            setFailed(true);
            return;
          }
          setFailed(read.length < settled.length);
          setResult({
            search,
            source,
            rows: mergeSessionRows(
              read.map(({ host, value }) => ({
                hostId: host.hostId,
                hostName: host.hostName,
                rows: value.sessions,
              })),
            ),
          });
          setSources(mergeSessionSources(read.map(({ value }) => value.sources ?? [])));
        })
        .finally(() => {
          if (flight.current !== abort) return;
          flight.current = undefined;
          setBusy(false);
          setPullRefreshing(false);
        });
    },
    [active, hostKey, online, search, searchReady, sort, source],
  );
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        flight.current?.abort();
        flight.current = undefined;
        setBusy(false);
        setPullRefreshing(false);
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
    busy,
    online,
    pullRefreshing,
    groups,
    canQuery: online && sources !== undefined,
    optionsActive: sort !== 'last-human-turn' || source !== 'all' || hideBots,
    changeSearch,
    refresh,
  };
}

function useOnline(hosts: readonly SessionQueryHost[], hostKey: string): boolean {
  const source = useMemo(() => onlineSource(hosts), [hostKey]);
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

export type SessionQuery = ReturnType<typeof useSessionQuery>;
