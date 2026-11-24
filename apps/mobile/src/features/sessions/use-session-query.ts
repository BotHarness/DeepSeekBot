import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { readHostSessionList } from '@botharness/host-client/host-sessions';
import {
  HOST_SESSION_SORTS,
  type HostSessionFilter,
  type HostSessionRow,
  type HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import { sessionReadHost } from '../../host/session-detail';
import { interfacePreferences, useSessionSort } from '../../ui/interface-preferences';
import type { SessionOptionGroup } from '../../ui/shell/host-session-options';
import { useStrings } from '../../ui/strings';

export function useSessionQuery(client: HostClient, active = true) {
  const t = useStrings().hostSessions;
  const sort = useSessionSort();
  const [source, setSource] = useState<HostSessionFilter>('all');
  const [sources, setSources] = useState<HostSessionSourceOption[]>();
  const [draft, setDraft] = useState('');
  const [debounced, setDebounced] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSearch = useRef('');
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
  const [pullRefreshing, setPullRefreshing] = useState(false);
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

  const refresh = useCallback(
    (origin?: 'pull') => {
      if (!active || !online || !searchReady) return;
      if (origin === 'pull') setPullRefreshing(true);
      if (flight.current !== undefined) return;
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
          setPullRefreshing(false);
        });
    },
    [active, client, online, search, searchReady, sort, source],
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
          .slice()
          .sort((a, b) => {
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
    optionsActive: sort !== 'last-human-turn' || source !== 'all',
    changeSearch,
    refresh,
  };
}

export type SessionQuery = ReturnType<typeof useSessionQuery>;
