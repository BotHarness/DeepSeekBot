import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { HostDirectoryListing } from './actions.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type {
  AssignmentAccessPresetView,
  ToolApprovalRuleView,
  WorkspaceGrantView,
  WorkspaceOption,
} from './bridge.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import { useMountedResource } from './mounted-resource.js';
import {
  publishWorkspaceGrantChange,
  subscribeWorkspaceGrantChanges,
  workspaceGrantRevision,
} from './workspace-grant-events.js';

type WorkspaceCache = {
  grants: WorkspaceGrantView[];
  workspaces: WorkspaceOption[];
  rules: ToolApprovalRuleView[];
  access: AssignmentAccessPresetView | undefined;
  memoryDir: string | undefined;
};
const workspaceCaches = new WeakMap<
  ChannelSidebarEntryProps['actions'],
  Map<string, WorkspaceCache>
>();

export function cachedWorkspace(
  actions: ChannelSidebarEntryProps['actions'],
  botSlug: string | undefined,
): WorkspaceCache | undefined {
  return botSlug === undefined ? undefined : workspaceCaches.get(actions)?.get(botSlug);
}

export function rememberWorkspace(
  actions: ChannelSidebarEntryProps['actions'],
  botSlug: string,
  patch: Partial<WorkspaceCache>,
): void {
  let cache = workspaceCaches.get(actions);
  if (cache === undefined) {
    cache = new Map();
    workspaceCaches.set(actions, cache);
  }
  const previous = cache.get(botSlug);
  cache.delete(botSlug);
  cache.set(botSlug, {
    grants: [],
    workspaces: [],
    rules: [],
    access: undefined,
    memoryDir: undefined,
    ...previous,
    ...patch,
  });
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
}

const WORKSPACE_ACTION_TIMEOUT_MS = 15_000;

export function withWorkspaceActionDeadline<T>(
  promise: Promise<T>,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(timeoutMessage)),
      WORKSPACE_ACTION_TIMEOUT_MS,
    );
    void promise.finally(() => window.clearTimeout(timer)).then(resolve, reject);
  });
}

export function pickerUnavailable(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null || !('rpcError' in cause)) return false;
  const rpcError = cause.rpcError;
  return (
    typeof rpcError === 'object' &&
    rpcError !== null &&
    'code' in rpcError &&
    rpcError.code === 'directory-picker/unavailable'
  );
}

export function folderBrowseError(cause: unknown, t: ChannelSidebarEntryProps['t']): string {
  return cause instanceof BridgeCallError && cause.code === 'folder-browse/timeout'
    ? t('grant.browseTimeout')
    : errorMessage(cause);
}

export function useWorkspaceGrants({
  botSlug,
  actions,
  t,
  composerOnly,
}: Pick<ChannelSidebarEntryProps, 'botSlug' | 'actions' | 't'> & { composerOnly: boolean }) {
  const slug = botSlug ?? '';
  const subscribeChanges = useCallback(
    (listener: () => void) => subscribeWorkspaceGrantChanges(slug, listener, actions),
    [slug, actions],
  );
  const getChangeRevision = useCallback(
    () => workspaceGrantRevision(slug, actions),
    [slug, actions],
  );
  const changeRevision = useSyncExternalStore(
    subscribeChanges,
    getChangeRevision,
    getChangeRevision,
  );
  const cached = cachedWorkspace(actions, botSlug);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>(cached?.workspaces ?? []);
  const [grants, setGrants] = useState<WorkspaceGrantView[]>(cached?.grants ?? []);
  const [rules, setRules] = useState<ToolApprovalRuleView[]>(cached?.rules ?? []);
  const [access, setAccess] = useState<AssignmentAccessPresetView | undefined>(cached?.access);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [pendingGrant, setPendingGrant] = useState<{
    path: string;
    workspaceId?: string;
  }>();
  const [memoryDir, setMemoryDir] = useState<string | undefined>(cached?.memoryDir);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [memoryLocation, setMemoryLocation] = useState('');
  const [browserListing, setBrowserListing] = useState<HostDirectoryListing | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(cached === undefined);
  const activeSlug = useRef<string | undefined>(undefined);
  const requestVersion = useRef(0);
  const showGrant = (grant: WorkspaceGrantView): void => {
    if (botSlug === undefined || activeSlug.current !== botSlug) return;
    const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
    const next = [...current.filter((row) => row.id !== grant.id), grant];
    rememberWorkspace(actions, botSlug, { grants: next });
    setGrants(next);
  };
  const writableByDefault = async (grant: WorkspaceGrantView): Promise<WorkspaceGrantView> => {
    if (botSlug === undefined || grant.orchestratorWrite === true) return grant;
    const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
    if (current.some((row) => row.id === grant.id && row.revokedAt === undefined)) return grant;
    showGrant(grant);
    return actions.setWorkspaceGrantWrite(botSlug, grant.id, true);
  };

  const refresh = async (slug: string): Promise<void> => {
    if (activeSlug.current !== slug) return;
    const version = ++requestVersion.current;
    const isCurrent = (): boolean =>
      activeSlug.current === slug && requestVersion.current === version;
    try {
      const owned = await withWorkspaceActionDeadline(
        actions.listWorkspaceGrants(slug),
        t('grant.loadTimeout'),
      );
      if (!isCurrent()) return;
      rememberWorkspace(actions, slug, { grants: owned });
      setGrants(owned);
      setLoading(false);
      const [available, memory, ruleRows, preset] = await Promise.all([
        actions.listWorkspaceOptions(),
        actions.memoryDirectory(slug),
        actions.listToolApprovalRules(slug),
        actions.assignmentAccess(slug),
      ]);
      if (!isCurrent()) return;
      rememberWorkspace(actions, slug, {
        workspaces: available,
        memoryDir: memory,
        rules: ruleRows,
        access: preset,
      });
      setWorkspaces(available);
      setMemoryDir(memory);
      setRules(ruleRows);
      setAccess(preset);
    } catch (cause) {
      if (isCurrent()) throw cause;
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    activeSlug.current = botSlug;
    requestVersion.current += 1;
    const current = cachedWorkspace(actions, botSlug);
    setWorkspaces(current?.workspaces ?? []);
    setGrants(current?.grants ?? []);
    setRules(current?.rules ?? []);
    setAccess(current?.access);
    setMemoryDir(current?.memoryDir);
    setMemoryLocation('');
    setBrowserListing(undefined);
    setBusy(undefined);
    setConfirmDanger(false);
    setPendingGrant(undefined);
    if (botSlug === undefined) return;
    setLoading(cachedWorkspace(actions, botSlug) === undefined);
    setError(undefined);
    void refresh(botSlug).catch((cause: unknown) => {
      if (activeSlug.current !== botSlug) return;
      setError(errorMessage(cause));
      setLoading(false);
    });
    return () => {
      activeSlug.current = undefined;
      requestVersion.current += 1;
    };
  }, [actions, botSlug, changeRevision]);
  const mutate = (id: string, action: () => Promise<unknown>): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy(id);
    setError(undefined);
    void (async () => {
      try {
        const operation = action().then((value) => {
          publishWorkspaceGrantChange(botSlug, actions);
          return value;
        });
        await withWorkspaceActionDeadline(operation, t('grant.operationTimeout'));
      } catch (cause) {
        if (activeSlug.current === botSlug) {
          setError(errorMessage(cause));
          if (composerOnly) {
            try {
              await refresh(botSlug);
            } catch (readback) {
              if (activeSlug.current === botSlug)
                setError(`${errorMessage(cause)} · ${errorMessage(readback)}`);
            }
          }
        }
      } finally {
        if (activeSlug.current === botSlug) setBusy(undefined);
      }
    })();
  };

  const chooseMemoryLocation = (): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy('memory-picker');
    setError(undefined);
    void actions
      .pickWorkspaceFolder()
      .then(
        (path) => {
          if (path !== null && activeSlug.current === botSlug) setMemoryLocation(path);
        },
        (cause: unknown) => {
          if (activeSlug.current === botSlug) setError(errorMessage(cause));
        },
      )
      .finally(() => {
        if (activeSlug.current === botSlug) setBusy(undefined);
      });
  };

  const moveMemory = (location: string | null): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy('memory-move');
    setError(undefined);
    void actions
      .moveMemoryLocation(botSlug, location)
      .then(
        (moved) => {
          rememberWorkspace(actions, botSlug, { memoryDir: moved });
          if (activeSlug.current !== botSlug) return;
          setMemoryDir(moved);
          setMemoryLocation('');
        },
        (cause: unknown) => {
          if (activeSlug.current === botSlug) setError(errorMessage(cause));
        },
      )
      .finally(() => {
        if (activeSlug.current === botSlug) setBusy(undefined);
      });
  };

  const openFolderBrowser = (): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy('folder-picker');
    setError(undefined);
    const pickNatively = async (): Promise<void> => {
      try {
        if (composerOnly) {
          const path = await actions.pickWorkspaceFolder();
          if (path !== null && activeSlug.current === botSlug) setPendingGrant({ path });
        } else {
          const grant = await actions.addWorkspaceFolder(botSlug);
          if (grant !== undefined) showGrant(await writableByDefault(grant));
          await refresh(botSlug);
        }
      } catch (nativeCause) {
        if (activeSlug.current === botSlug) setError(errorMessage(nativeCause));
      }
    };
    void (async () => {
      try {
        const listing = await actions.listHostFolders();
        if (activeSlug.current !== botSlug) return;
        if (listing.nativePicker === true) await pickNatively();
        else setBrowserListing(listing);
      } catch (cause) {
        if (activeSlug.current !== botSlug) return;
        if (pickerUnavailable(cause)) await pickNatively();
        else setError(folderBrowseError(cause, t));
      } finally {
        if (activeSlug.current === botSlug) setBusy(undefined);
      }
    })();
  };

  const previewFolder = (): void => {
    if (botSlug === undefined || busy !== undefined) return;
    setBusy('preview-folder');
    setError(undefined);
    void withWorkspaceActionDeadline(
      actions.listHostFolders(manualPath.trim()),
      t('grant.loadTimeout'),
    )
      .then(
        (resolved) => {
          if (activeSlug.current === botSlug) setPendingGrant({ path: resolved.path });
        },
        (cause: unknown) => {
          if (activeSlug.current === botSlug) setError(folderBrowseError(cause, t));
        },
      )
      .finally(() => {
        if (activeSlug.current === botSlug) setBusy(undefined);
      });
  };

  return {
    workspaces,
    grants,
    rules,
    access,
    confirmDanger,
    setConfirmDanger,
    pendingGrant,
    setPendingGrant,
    memoryDir,
    manualOpen,
    setManualOpen,
    manualPath,
    setManualPath,
    memoryLocation,
    setMemoryLocation,
    browserListing,
    setBrowserListing,
    busy,
    error,
    loading,
    activeSlug,
    setGrants,
    showGrant,
    writableByDefault,
    mount,
    mutate,
    chooseMemoryLocation,
    moveMemory,
    openFolderBrowser,
    previewFolder,
  };
}
