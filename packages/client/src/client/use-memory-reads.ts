import { useRef, useState, useSyncExternalStore } from 'react';
import type {
  MemoryGitGraph,
  MemorySnapshot,
  MemoryVersion,
  MemoryWorkingChange,
} from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { cachedMemory, subscribeMemory } from './memory-read-cache.js';
import { useMountedResource } from './mounted-resource.js';

export function useMemoryReads({
  actions,
  channelId,
  refreshRevision,
  conversationRevision,
  showFiles,
}: Pick<ChannelSidebarEntryProps, 'actions' | 'channelId'> & {
  refreshRevision: ChannelSidebarEntryProps['refreshRevision'];
  conversationRevision: ChannelSidebarEntryProps['conversationRevision'];
  showFiles: boolean;
}) {
  const cache = cachedMemory(actions, channelId);
  const initialPath = cache.snapshot?.files[0];
  const [refresh, setRefresh] = useState(0);
  const invalidated = useSyncExternalStore(
    (listener) => subscribeMemory(cache, listener),
    () => cache.revision,
    () => cache.revision,
  );
  const [versions, setVersions] = useState<MemoryVersion[]>();
  const [versionsError, setVersionsError] = useState<string>();
  const versionsMount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    void actions.memoryVersions(channelId).then(
      (next) => {
        if (!active) return;
        setVersions(next);
        setVersionsError(undefined);
      },
      (failure: unknown) => {
        if (active) setVersionsError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions, channelId, refresh, refreshRevision]);
  const [snapshot, setSnapshot] = useState<MemorySnapshot | undefined>(cache.snapshot);
  const [graph, setGraph] = useState<MemoryGitGraph | undefined>(cache.graph);
  const [working, setWorking] = useState<MemoryWorkingChange[]>(cache.working ?? []);
  const [workingLoaded, setWorkingLoaded] = useState(cache.working !== undefined);
  const [workingError, setWorkingError] = useState<string | undefined>(cache.workingError);
  const [workingPending, setWorkingPending] = useState(false);
  const [graphPending, setGraphPending] = useState(false);
  const [snapshotPending, setSnapshotPending] = useState(false);
  const memoryRequestGeneration = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [file, setFile] = useState<
    | {
        path: string;
        body: string;
        head: string;
        binary?: boolean;
      }
    | undefined
  >(initialPath === undefined ? undefined : cache.files.get(initialPath));
  const [draft, setDraft] = useState(
    initialPath === undefined ? '' : (cache.files.get(initialPath)?.body ?? ''),
  );
  const draftState = useRef({
    path: initialPath,
    body: initialPath === undefined ? '' : (cache.files.get(initialPath)?.body ?? ''),
    value: initialPath === undefined ? '' : (cache.files.get(initialPath)?.body ?? ''),
    version: 0,
  });
  const [error, setError] = useState<string>();
  const [snapshotError, setSnapshotError] = useState<string | undefined>(cache.snapshotError);
  const [graphError, setGraphError] = useState<string | undefined>(cache.graphError);

  const graphMount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const requestGeneration = memoryRequestGeneration.current;
    let graphTimer: ReturnType<typeof setTimeout> | undefined;
    let graphInFlight = false;
    setError(undefined);
    const loadGraph = (): void => {
      if (!active || requestGeneration !== memoryRequestGeneration.current || graphInFlight) return;
      if (document.visibilityState === 'hidden') {
        graphTimer = setTimeout(loadGraph, 20_000);
        return;
      }
      graphInFlight = true;
      setGraphPending(true);
      void actions
        .memoryGitGraph(channelId, 0)
        .then(
          (next) => {
            if (!active || requestGeneration !== memoryRequestGeneration.current) return;
            const current = cache.graph;
            const merged =
              current?.head === next.head &&
              current.currentBranch === next.currentBranch &&
              current.commits.length > next.commits.length
                ? {
                    ...next,
                    commits: current.commits,
                    hasMore: current.hasMore,
                  }
                : next;
            cache.graph = merged;
            setGraph(merged);
            cache.graphError = undefined;
            setGraphError(undefined);
          },
          (failure: unknown) => {
            if (active && requestGeneration === memoryRequestGeneration.current) {
              cache.graphError = failure instanceof Error ? failure.message : String(failure);
              setGraphError(cache.graphError);
            }
          },
        )
        .finally(() => {
          graphInFlight = false;
          if (active && requestGeneration === memoryRequestGeneration.current)
            setGraphPending(false);
          if (active && !showFiles) graphTimer = setTimeout(loadGraph, 20_000);
        });
    };
    if (!showFiles) {
      loadGraph();
      const onVisible = (): void => {
        if (document.visibilityState !== 'visible') return;
        clearTimeout(graphTimer);
        loadGraph();
      };
      window.addEventListener('focus', onVisible);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        active = false;
        clearTimeout(graphTimer);
        window.removeEventListener('focus', onVisible);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    setSnapshotPending(true);
    void actions
      .memorySnapshot(channelId)
      .then((next) => {
        if (!active || requestGeneration !== memoryRequestGeneration.current) return;
        cache.snapshot = next;
        cache.snapshotError = undefined;
        setSnapshotError(undefined);
        setSnapshot(next);
        setPath((current) =>
          current !== undefined && next.files.includes(current) ? current : next.files[0],
        );
      })
      .catch((failure: unknown) => {
        if (active && requestGeneration === memoryRequestGeneration.current) {
          cache.snapshotError = failure instanceof Error ? failure.message : String(failure);
          setSnapshotError(cache.snapshotError);
        }
      })
      .finally(() => {
        if (active && requestGeneration === memoryRequestGeneration.current)
          setSnapshotPending(false);
        loadGraph();
      });
    return () => {
      active = false;
      clearTimeout(graphTimer);
    };
  }, [actions, channelId, refresh, refreshRevision, conversationRevision, showFiles, invalidated]);

  const workingMount = useMountedResource<HTMLDivElement>(() => {
    if (showFiles) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const load = (): void => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(load, 15_000);
        return;
      }
      inFlight = true;
      setWorkingPending(true);
      void actions
        .memoryWorkingChanges(channelId)
        .then(
          (next) => {
            if (active) {
              cache.working = next;
              setWorking(next);
              setWorkingLoaded(true);
              cache.workingError = undefined;
              setWorkingError(undefined);
            }
          },
          (failure: unknown) => {
            if (active) {
              cache.workingError = failure instanceof Error ? failure.message : String(failure);
              setWorkingError(cache.workingError);
            }
          },
        )
        .finally(() => {
          inFlight = false;
          if (active) setWorkingPending(false);
          if (active) timer = setTimeout(load, 15_000);
        });
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      load();
    };
    load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, refresh, refreshRevision, conversationRevision, showFiles, invalidated]);

  const fileMount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const requestGeneration = memoryRequestGeneration.current;
    const cachedFile = path === undefined ? undefined : cache.files.get(path);
    if (draftState.current.path !== path) {
      const body = cachedFile?.body ?? '';
      draftState.current = {
        path,
        body,
        value: body,
        version: draftState.current.version + 1,
      };
      setFile(cachedFile);
      setDraft(body);
    }
    const requestVersion = draftState.current.version;
    if (showFiles && path !== undefined) {
      void actions
        .memoryFile(channelId, path)
        .then((next) => {
          if (!active || requestGeneration !== memoryRequestGeneration.current) return;
          if (next !== undefined) {
            cache.files.delete(path);
            cache.files.set(path, next);
            if (cache.files.size > 20) cache.files.delete(cache.files.keys().next().value!);
          }
          setFile(next);
          const preserveDraft =
            draftState.current.version !== requestVersion ||
            draftState.current.value !== draftState.current.body;
          draftState.current.body = next?.body ?? '';
          if (!preserveDraft) {
            draftState.current.value = next?.body ?? '';
            setDraft(next?.body ?? '');
          }
        })
        .catch((failure: unknown) => {
          if (active && requestGeneration === memoryRequestGeneration.current)
            setError(failure instanceof Error ? failure.message : String(failure));
        });
    }
    return () => {
      active = false;
    };
  }, [actions, channelId, path, refresh, showFiles]);

  const loadMore = async (): Promise<void> => {
    if (graph === undefined || !graph.hasMore || loadingMore) return;
    const requestGeneration = memoryRequestGeneration.current;
    setLoadingMore(true);
    try {
      const next = await actions.memoryGitGraph(channelId, graph.commits.length);
      if (requestGeneration !== memoryRequestGeneration.current) return;
      const merged = { ...next, commits: [...graph.commits, ...next.commits] };
      cache.graph = merged;
      setGraph(merged);
    } catch (failure) {
      if (requestGeneration === memoryRequestGeneration.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    cache,
    setRefresh,
    versions,
    versionsError,
    versionsMount,
    snapshot,
    setSnapshot,
    graph,
    setGraph,
    working,
    setWorking,
    workingLoaded,
    setWorkingLoaded,
    workingError,
    workingPending,
    graphPending,
    snapshotPending,
    memoryRequestGeneration,
    loadingMore,
    path,
    setPath,
    file,
    setFile,
    draft,
    setDraft,
    draftState,
    error,
    setError,
    snapshotError,
    graphError,
    graphMount,
    workingMount,
    fileMount,
    loadMore,
  };
}
