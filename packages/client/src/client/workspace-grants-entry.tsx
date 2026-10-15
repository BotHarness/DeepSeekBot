import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Button,
  IconChevronDownOutlineRegular,
  IconCloseOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconPlusOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  Switch,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { HostDirectoryListing } from './actions.js';
import type {
  WorkspaceGrantView,
  WorkspaceOption,
  ToolApprovalRuleView,
  AssignmentAccessPresetView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import { isAbsoluteHostPath } from './persona-bot-create.js';
import { MemoryFileActionButton, MemoryFileOpenButton } from './memory-file-actions.js';
import { WorkspaceFileOpenButton, WorkspaceFilePathButton } from './workspace-file-actions.js';
import { Callout } from './ds/callout.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { ApprovalTemplateEntry } from './approval-template-entry.js';
import {
  publishWorkspaceGrantChange,
  subscribeWorkspaceGrantChanges,
  workspaceGrantRevision,
} from './workspace-grant-events.js';

export { WORKSPACE_GRANTS_CHANGED } from './workspace-grant-events.js';

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

function cachedWorkspace(
  actions: ChannelSidebarEntryProps['actions'],
  botSlug: string | undefined,
): WorkspaceCache | undefined {
  return botSlug === undefined ? undefined : workspaceCaches.get(actions)?.get(botSlug);
}

function rememberWorkspace(
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

export function FolderSectionSummary({ children }: { children: ReactNode }): ReactElement {
  return (
    <summary className="bh-channel-sidebar-entry-head">
      <span className="bh-channel-sidebar-entry-chevron" aria-hidden="true">
        <IconChevronDownOutlineRegular size={14} />
      </span>
      <span className="bh-channel-sidebar-entry-label">{children}</span>
    </summary>
  );
}

export function withWorkspaceActionDeadline<T>(
  promise: Promise<T>,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(timeoutMessage)),
      WORKSPACE_ACTION_TIMEOUT_MS,
    );
    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        window.clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function secretCliRuleLabel(input: string): { program: string; account: string } {
  try {
    const kind = JSON.parse(input) as { program?: unknown; account?: unknown };
    return {
      program: typeof kind.program === 'string' ? kind.program : '?',
      account: typeof kind.account === 'string' ? kind.account : '?',
    };
  } catch {
    return { program: '?', account: '?' };
  }
}

function approvalRulePath(rule: ToolApprovalRuleView): string {
  try {
    const scope = JSON.parse(rule.scopeKey) as unknown;
    if (Array.isArray(scope) && typeof scope[1] === 'string') return scope[1];
  } catch {}
  return rule.scopeKey;
}

export function FolderRow({
  name,
  path,
  icon = 'folder-key',
  chips,
  remove,
  removeLabel,
  removeUnavailable,
  removeText,
  disabled,
  detail,
  pathAction,
  control,
  initiallyExpanded = false,
}: {
  name: string;
  path: string;
  icon?: string;
  chips?: ReactNode;
  remove?: () => void;
  removeLabel?: string;
  removeUnavailable?: string;
  removeText?: string;
  disabled?: boolean;
  detail?: ReactNode;
  pathAction?: ReactNode;
  control?: ReactNode;
  initiallyExpanded?: boolean;
}): ReactElement {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const detailId = useId();
  return (
    <SidebarCardRow
      icon={icon}
      title={name}
      hint={name}
      mainClassName="bh-workspace-folder-toggle"
      expanded={expanded}
      controls={detailId}
      onClick={() => setExpanded((value) => !value)}
      {...(chips === undefined ? {} : { chips })}
      trailing={
        <>
          {control}
          {remove === undefined && removeUnavailable === undefined ? null : (
            <Button
              variant="outline"
              size="sm"
              className="bh-workspace-folder-delete"
              aria-label={removeLabel ?? removeUnavailable}
              title={removeUnavailable ?? removeLabel}
              disabled={remove === undefined || disabled}
              onClick={remove}
            >
              <IconTrashOutlineRegular size={16} />
              {removeText}
            </Button>
          )}
          <IconChevronDownOutlineRegular
            size={14}
            className={
              expanded ? 'bh-workspace-folder-chevron bh-expanded' : 'bh-workspace-folder-chevron'
            }
          />
        </>
      }
      {...(expanded
        ? {
            detail: (
              <div className="bh-workspace-folder-detail">
                {pathAction ?? (
                  <div className="bh-workspace-folder-path" title={path}>
                    {path}
                  </div>
                )}
                {detail}
              </div>
            ),
          }
        : {})}
    />
  );
}

export function AddFolderRow({
  label,
  disabled,
  onAdd,
}: {
  label: string;
  disabled: boolean;
  onAdd: () => void;
}): ReactElement {
  return (
    <SidebarCardRow
      leading={<IconPlusOutlineRegular size={16} />}
      title={label}
      mainClassName="bh-workspace-folder-add"
      disabled={disabled}
      onClick={onAdd}
    />
  );
}

function pickerUnavailable(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null || !('rpcError' in cause)) return false;
  const rpcError = cause.rpcError;
  return (
    typeof rpcError === 'object' &&
    rpcError !== null &&
    'code' in rpcError &&
    rpcError.code === 'directory-picker/unavailable'
  );
}

const accessStyles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: space.x3 },
  actions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.x2 },
});

const memoryMoveStyles = stylex.create({
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
  grow: { flexGrow: 1, minWidth: 0 },
});

const browserStyles = stylex.create({
  crumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
  },
  crumb: {
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.fg,
    outlineOffset: '-2px',
  },
  current: { backgroundColor: color.selected, color: color.fg },
  list: {
    minHeight: '180px',
    maxHeight: 'min(360px, 50vh)',
    overflowY: 'auto',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.sm,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'left',
    cursor: 'pointer',
    outlineWidth: { default: 0, ':focus-visible': border.focus },
    outlineStyle: 'solid',
    outlineColor: color.fg,
    outlineOffset: '-2px',
  },
  empty: { paddingBlock: space.x3, paddingInline: space.x4 },
  hidden: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
  },
  checkbox: { margin: 0, accentColor: color.accent },
});

export function FolderBrowser({
  initial,
  actions,
  onCancel,
  onChoose,
  busy,
  t,
}: {
  initial: HostDirectoryListing;
  actions: ChannelSidebarEntryProps['actions'];
  onCancel: () => void;
  onChoose: (path: string) => void;
  busy: boolean;
  t: ChannelSidebarEntryProps['t'];
}): ReactElement {
  const [listing, setListing] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showHidden, setShowHidden] = useState(false);
  const request = useRef<AbortController | undefined>();

  const abortOnUnmount = useMountedResource<HTMLDivElement>(
    () => () => request.current?.abort(),
    [],
  );

  const navigate = (path: string): void => {
    if (busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(undefined);
    void actions
      .listHostFolders(path, controller.signal)
      .then(
        (next) => {
          if (!controller.signal.aborted) setListing(next);
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(cause));
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  };

  return (
    <PanelDialog
      size="medium"
      title={t('grant.browseTitle')}
      description={t('grant.browseHelp')}
      closeLabel={t('common.close')}
      onClose={() => {
        if (!busy) onCancel();
      }}
      data={{ 'data-folder-browser': '' }}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || loading}
            onClick={() => onChoose(listing.path)}
          >
            {t('grant.authorize')}
          </Button>
        </>
      }
    >
      <div
        aria-label={t('grant.browseLocation')}
        ref={abortOnUnmount}
        {...stylex.props(browserStyles.crumbs)}
      >
        {listing.crumbs.map((crumb, index) => (
          <button
            type="button"
            key={crumb.path}
            data-folder-browser-crumb=""
            aria-current={index === listing.crumbs.length - 1 ? 'location' : undefined}
            disabled={busy || loading}
            onClick={() => navigate(crumb.path)}
            {...stylex.props(
              browserStyles.crumb,
              index === listing.crumbs.length - 1 && browserStyles.current,
            )}
          >
            {crumb.name}
          </button>
        ))}
      </div>
      <div role="list" aria-label={t('grant.browseFolders')} {...stylex.props(browserStyles.list)}>
        {listing.entries
          .filter((entry) => showHidden || !entry.hidden)
          .map((entry) => (
            <button
              type="button"
              role="listitem"
              key={entry.path}
              data-folder-browser-item=""
              disabled={busy || loading}
              onClick={() => navigate(entry.path)}
              {...stylex.props(browserStyles.item)}
            >
              <IconFolderOpenOutlineRegular size={16} />
              <span>{entry.name}</span>
            </button>
          ))}
        {listing.entries.length === 0 ? (
          <div {...stylex.props(browserStyles.empty)}>
            <Note>{t('grant.browseEmpty')}</Note>
          </div>
        ) : null}
      </div>
      {listing.truncated ? <Note>{t('grant.browseTruncated')}</Note> : null}
      {loading ? <LoadingSkeleton kind="sidebar" label={t('grant.loading')} /> : null}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
      <label {...stylex.props(browserStyles.hidden)}>
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => setShowHidden(event.target.checked)}
          {...stylex.props(browserStyles.checkbox)}
        />
        {t('grant.showHidden')}
      </label>
    </PanelDialog>
  );
}

export function WorkspaceGrantsEntry({
  botSlug,
  actions,
  t,
  developerMode = false,
  composerOnly = false,
  botName,
}: ChannelSidebarEntryProps & {
  developerMode?: boolean;
  composerOnly?: boolean;
  botName?: string;
}): ReactElement {
  const slug = botSlug ?? '';
  const subscribeChanges = useCallback(
    (listener: () => void) => subscribeWorkspaceGrantChanges(slug, listener),
    [slug],
  );
  const getChangeRevision = useCallback(() => workspaceGrantRevision(slug), [slug]);
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
  const [pendingGrant, setPendingGrant] = useState<{ path: string; workspaceId?: string }>();
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
          publishWorkspaceGrantChange(botSlug);
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
    void (async () => {
      try {
        const listing = await actions.listHostFolders();
        if (activeSlug.current !== botSlug) return;
        setBrowserListing(listing);
      } catch (cause) {
        if (activeSlug.current !== botSlug) return;
        if (pickerUnavailable(cause)) {
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
        } else {
          setError(errorMessage(cause));
        }
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
          if (activeSlug.current === botSlug) setError(errorMessage(cause));
        },
      )
      .finally(() => {
        if (activeSlug.current === botSlug) setBusy(undefined);
      });
  };

  if (botSlug === undefined) return <div className="bh-note">{t('grant.noBot')}</div>;
  const active = grants.filter((grant) => grant.revokedAt === undefined);
  const revoked = grants.filter((grant) => grant.revokedAt !== undefined);
  const activeIds = new Set(active.map((grant) => grant.workspaceId));
  const available = workspaces.filter((workspace) => !activeIds.has(workspace.id));

  return (
    <div className="bh-workspace-grants" ref={mount}>
      {developerMode ? <div className="bh-note">{t('grant.safeDefault')}</div> : null}
      {loading && grants.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('grant.loading')} />
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      <SettingsRows>
        <SettingsSection title={t('grant.section')}>
          <div {...stylex.props(accessStyles.stack)}>
            {composerOnly ? (
              <WorkspaceFolderPicker
                actions={actions}
                t={t}
                disabled={busy !== undefined}
                workspaces={available}
                listLabel={t('entry.workspaceGrants')}
                rows={
                  <>
                    <FolderRow
                      icon="git-branch"
                      name={t('grant.memory')}
                      removeText={t('grant.delete')}
                      removeUnavailable={t('grant.memoryDeleteUnavailable')}
                      path={memoryDir ?? ''}
                      pathAction={
                        memoryDir === undefined ? undefined : (
                          <MemoryFileActionButton
                            actions={actions}
                            slug={botSlug}
                            path=""
                            text={memoryDir}
                            className="bh-workspace-folder-path"
                            t={t}
                          />
                        )
                      }
                      control={
                        memoryDir === undefined ? undefined : (
                          <MemoryFileOpenButton
                            actions={actions}
                            slug={botSlug}
                            path=""
                            name={memoryDir}
                            compact
                            t={t}
                          />
                        )
                      }
                      detail={
                        memoryDir === undefined ? undefined : (
                          <div className="bh-workspace-folder-manual" data-memory-move="">
                            <div className="bh-note">{t('grant.memoryMove.hint')}</div>
                            <div {...stylex.props(memoryMoveStyles.row)}>
                              <Input
                                className={stylex.props(memoryMoveStyles.grow).className ?? ''}
                                aria-label={t('grant.memoryMove.label')}
                                placeholder={t('grant.memoryMove.placeholder')}
                                value={memoryLocation}
                                disabled={busy !== undefined}
                                autoCapitalize="none"
                                autoComplete="off"
                                spellCheck={false}
                                onChange={(event) => setMemoryLocation(event.currentTarget.value)}
                              />
                              <Button
                                variant="outline"
                                disabled={busy !== undefined}
                                onClick={chooseMemoryLocation}
                              >
                                {t('bot.create.memoryLocation.choose')}
                              </Button>
                            </div>
                            {memoryLocation.trim().length > 0 &&
                            !isAbsoluteHostPath(memoryLocation.trim()) ? (
                              <div className="bh-error" role="alert">
                                {t('bot.create.memoryLocation.relative')}
                              </div>
                            ) : null}
                            <div {...stylex.props(memoryMoveStyles.row)}>
                              <Button
                                variant="primary"
                                disabled={
                                  busy !== undefined || !isAbsoluteHostPath(memoryLocation.trim())
                                }
                                onClick={() => moveMemory(memoryLocation.trim())}
                              >
                                {busy === 'memory-move'
                                  ? t('grant.memoryMove.moving')
                                  : t('grant.memoryMove.move')}
                              </Button>
                              <Button
                                variant="outline"
                                disabled={busy !== undefined}
                                onClick={() => moveMemory(null)}
                              >
                                {t('grant.memoryMove.default')}
                              </Button>
                            </div>
                          </div>
                        )
                      }
                    />
                    {active.map((grant) => (
                      <FolderRow
                        key={grant.id}
                        name={grant.workspaceTitle}
                        path={grant.workspacePath}
                        pathAction={
                          <WorkspaceFilePathButton
                            actions={actions}
                            slug={botSlug}
                            grantId={grant.id}
                            text={grant.workspacePath}
                            t={t}
                          />
                        }
                        disabled={busy !== undefined}
                        control={
                          <>
                            <label
                              className="bh-workspace-folder-write"
                              title={t('grant.orchestratorWrite')}
                            >
                              <span>{t('grant.chip.write')}</span>
                              <Switch
                                checked={grant.orchestratorWrite === true}
                                disabled={busy !== undefined}
                                label={t('grant.orchestratorWrite') + ': ' + grant.workspaceTitle}
                                onChange={(enabled) =>
                                  mutate(grant.id, async () => {
                                    const updated = await actions.setWorkspaceGrantWrite(
                                      botSlug,
                                      grant.id,
                                      enabled,
                                    );
                                    const current =
                                      cachedWorkspace(actions, botSlug)?.grants ?? grants;
                                    const next = current.map((row) =>
                                      row.id === updated.id ? updated : row,
                                    );
                                    rememberWorkspace(actions, botSlug, { grants: next });
                                    if (activeSlug.current === botSlug) setGrants(next);
                                  })
                                }
                              />
                            </label>
                            <WorkspaceFileOpenButton
                              actions={actions}
                              slug={botSlug}
                              grantId={grant.id}
                              name={grant.workspacePath}
                              t={t}
                            />
                          </>
                        }
                        removeText={t('grant.delete')}
                        removeLabel={t('grant.removeFolder') + ': ' + grant.workspaceTitle}
                        remove={() =>
                          mutate(grant.id, async () => {
                            const revokedGrant = await actions.revokeWorkspaceGrant(
                              botSlug,
                              grant.id,
                            );
                            const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
                            const next = current.map((row) =>
                              row.id === revokedGrant.id ? revokedGrant : row,
                            );
                            rememberWorkspace(actions, botSlug, { grants: next });
                            if (activeSlug.current === botSlug) setGrants(next);
                          })
                        }
                      />
                    ))}
                  </>
                }
                onChoose={(path, workspaceId) =>
                  setPendingGrant({ path, ...(workspaceId === undefined ? {} : { workspaceId }) })
                }
              />
            ) : (
              <SidebarCardList
                className="bh-workspace-folder-table"
                label={t('entry.workspaceGrants')}
              >
                <FolderRow
                  icon="git-branch"
                  name={t('grant.memory')}
                  removeText={t('grant.delete')}
                  removeUnavailable={t('grant.memoryDeleteUnavailable')}
                  path={memoryDir ?? ''}
                  pathAction={
                    memoryDir === undefined ? undefined : (
                      <MemoryFileActionButton
                        actions={actions}
                        slug={botSlug}
                        path=""
                        text={memoryDir}
                        className="bh-workspace-folder-path"
                        t={t}
                      />
                    )
                  }
                  control={
                    memoryDir === undefined ? undefined : (
                      <MemoryFileOpenButton
                        actions={actions}
                        slug={botSlug}
                        path=""
                        name={memoryDir}
                        compact
                        t={t}
                      />
                    )
                  }
                  detail={
                    memoryDir === undefined ? undefined : (
                      <div className="bh-workspace-folder-manual" data-memory-move="">
                        <div className="bh-note">{t('grant.memoryMove.hint')}</div>
                        <div {...stylex.props(memoryMoveStyles.row)}>
                          <Input
                            className={stylex.props(memoryMoveStyles.grow).className ?? ''}
                            aria-label={t('grant.memoryMove.label')}
                            placeholder={t('grant.memoryMove.placeholder')}
                            value={memoryLocation}
                            disabled={busy !== undefined}
                            autoCapitalize="none"
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => setMemoryLocation(event.currentTarget.value)}
                          />
                          <Button
                            variant="outline"
                            disabled={busy !== undefined}
                            onClick={chooseMemoryLocation}
                          >
                            {t('bot.create.memoryLocation.choose')}
                          </Button>
                        </div>
                        {memoryLocation.trim().length > 0 &&
                        !isAbsoluteHostPath(memoryLocation.trim()) ? (
                          <div className="bh-error" role="alert">
                            {t('bot.create.memoryLocation.relative')}
                          </div>
                        ) : null}
                        <div {...stylex.props(memoryMoveStyles.row)}>
                          <Button
                            variant="primary"
                            disabled={
                              busy !== undefined || !isAbsoluteHostPath(memoryLocation.trim())
                            }
                            onClick={() => moveMemory(memoryLocation.trim())}
                          >
                            {busy === 'memory-move'
                              ? t('grant.memoryMove.moving')
                              : t('grant.memoryMove.move')}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy !== undefined}
                            onClick={() => moveMemory(null)}
                          >
                            {t('grant.memoryMove.default')}
                          </Button>
                        </div>
                      </div>
                    )
                  }
                />
                {active.map((grant) => (
                  <FolderRow
                    key={grant.id}
                    name={grant.workspaceTitle}
                    path={grant.workspacePath}
                    pathAction={
                      <WorkspaceFilePathButton
                        actions={actions}
                        slug={botSlug}
                        grantId={grant.id}
                        text={grant.workspacePath}
                        t={t}
                      />
                    }
                    disabled={busy !== undefined}
                    control={
                      <>
                        <label
                          className="bh-workspace-folder-write"
                          title={t('grant.orchestratorWrite')}
                        >
                          <span>{t('grant.chip.write')}</span>
                          <Switch
                            checked={grant.orchestratorWrite === true}
                            disabled={busy !== undefined}
                            label={t('grant.orchestratorWrite') + ': ' + grant.workspaceTitle}
                            onChange={(enabled) =>
                              mutate(grant.id, async () => {
                                const updated = await actions.setWorkspaceGrantWrite(
                                  botSlug,
                                  grant.id,
                                  enabled,
                                );
                                const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
                                const next = current.map((row) =>
                                  row.id === updated.id ? updated : row,
                                );
                                rememberWorkspace(actions, botSlug, { grants: next });
                                if (activeSlug.current === botSlug) setGrants(next);
                              })
                            }
                          />
                        </label>
                        <WorkspaceFileOpenButton
                          actions={actions}
                          slug={botSlug}
                          grantId={grant.id}
                          name={grant.workspacePath}
                          t={t}
                        />
                      </>
                    }
                    removeText={t('grant.delete')}
                    removeLabel={t('grant.removeFolder') + ': ' + grant.workspaceTitle}
                    remove={() =>
                      mutate(grant.id, async () => {
                        const revokedGrant = await actions.revokeWorkspaceGrant(botSlug, grant.id);
                        const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
                        const next = current.map((row) =>
                          row.id === revokedGrant.id ? revokedGrant : row,
                        );
                        rememberWorkspace(actions, botSlug, { grants: next });
                        if (activeSlug.current === botSlug) setGrants(next);
                      })
                    }
                  />
                ))}
                <AddFolderRow
                  label={t('grant.addFolder')}
                  disabled={busy !== undefined}
                  onAdd={openFolderBrowser}
                />
              </SidebarCardList>
            )}
            {busy === undefined ? null : (
              <div className="bh-note" role="status">
                {t('grant.working')}
              </div>
            )}
            {developerMode && !composerOnly ? (
              <details
                className="bh-workspace-folder-secondary"
                open={manualOpen}
                onToggle={(event) => setManualOpen(event.currentTarget.open)}
              >
                <FolderSectionSummary>{t('grant.enterPath')}</FolderSectionSummary>
                <div className="bh-workspace-folder-manual">
                  <div className="bh-note">{t('grant.pathHelp')}</div>
                  <Input
                    aria-label={t('grant.pathLabel')}
                    placeholder={t('grant.pathPlaceholder')}
                    value={manualPath}
                    onChange={(event) => setManualPath(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={busy !== undefined || manualPath.trim().length === 0}
                    onClick={() => {
                      if (composerOnly) {
                        previewFolder();
                        return;
                      }
                      mutate('manual-folder', async () => {
                        showGrant(
                          await writableByDefault(
                            await actions.authorizeWorkspacePath(botSlug, manualPath.trim()),
                          ),
                        );
                        if (activeSlug.current === botSlug) {
                          setManualPath('');
                          setManualOpen(false);
                        }
                      });
                    }}
                  >
                    {t('grant.authorize')}
                  </Button>
                </div>
              </details>
            ) : null}
            {!developerMode || composerOnly || available.length === 0 ? null : (
              <details className="bh-workspace-folder-secondary">
                <FolderSectionSummary>{t('grant.registeredFolders')}</FolderSectionSummary>
                <SidebarCardList className="bh-workspace-folder-table">
                  {available.map((workspace) => (
                    <FolderRow
                      key={workspace.id}
                      name={workspace.title}
                      path={workspace.path}
                      detail={
                        <Button
                          variant="outline"
                          disabled={busy !== undefined}
                          onClick={() => {
                            if (composerOnly)
                              setPendingGrant({ path: workspace.path, workspaceId: workspace.id });
                            else
                              mutate(workspace.id, async () =>
                                showGrant(
                                  await writableByDefault(
                                    await actions.createWorkspaceGrant(botSlug, workspace.id),
                                  ),
                                ),
                              );
                          }}
                        >
                          {t('grant.authorize')}
                        </Button>
                      }
                    />
                  ))}
                </SidebarCardList>
              </details>
            )}
            {!developerMode || revoked.length === 0 ? null : (
              <details className="bh-workspace-folder-secondary">
                <FolderSectionSummary>
                  {t('grant.history')} ({revoked.length})
                </FolderSectionSummary>
                <SidebarCardList className="bh-workspace-folder-table">
                  {revoked.map((grant) => (
                    <FolderRow
                      key={grant.id}
                      name={grant.workspaceTitle}
                      path={grant.workspacePath}
                    />
                  ))}
                </SidebarCardList>
              </details>
            )}
          </div>
        </SettingsSection>
        <SettingsSection title={t('access.section')}>
          <SettingsRow
            title={t('access.title')}
            description={t('access.description')}
            data={{ 'data-assignment-access': access?.mode }}
            control={
              <Switch
                checked={access?.mode === 'danger-full-access' || confirmDanger}
                disabled={loading || busy !== undefined}
                onChange={(checked) => {
                  if (checked) {
                    setConfirmDanger(true);
                  } else if (confirmDanger) {
                    setConfirmDanger(false);
                  } else {
                    mutate('safe-access', () =>
                      actions.setAssignmentAccess(botSlug, 'workspace-write', false),
                    );
                  }
                }}
                label={`${t('access.title')} · ${botName ?? botSlug}`}
              />
            }
          />
          <div {...stylex.props(accessStyles.stack)}>
            {confirmDanger ? (
              <Callout tone="danger" role="alert" title={t('access.confirmTitle')}>
                <div>{t('access.confirmRisk')}</div>
                <div {...stylex.props(accessStyles.actions)}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== undefined}
                    onClick={() => setConfirmDanger(false)}
                  >
                    {t('approval.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy !== undefined}
                    onClick={() =>
                      mutate('danger-access', async () => {
                        await actions.setAssignmentAccess(botSlug, 'danger-full-access', true);
                        if (activeSlug.current === botSlug) setConfirmDanger(false);
                      })
                    }
                  >
                    {t('access.confirmEnable')}
                  </Button>
                </div>
              </Callout>
            ) : null}
            {access?.mode === 'danger-full-access' ? (
              <>
                <Callout tone="warning" role="status">
                  {t(
                    access.scope === 'assignments'
                      ? 'access.activeWarningAssignments'
                      : 'access.activeWarning',
                  )}
                </Callout>
                <SettingsRow
                  title={t('access.scopeTitle')}
                  control={
                    <Select
                      label={t('access.scopeTitle')}
                      value={access.scope ?? 'chat'}
                      disabled={loading || busy !== undefined}
                      options={[
                        { value: 'chat', label: t('access.scopeChat') },
                        { value: 'assignments', label: t('access.scopeAssignments') },
                      ]}
                      onChange={(scope) =>
                        mutate('access-scope', () =>
                          actions.setAssignmentAccess(botSlug, 'danger-full-access', true, scope),
                        )
                      }
                    />
                  }
                />
              </>
            ) : null}
          </div>
        </SettingsSection>
        {composerOnly ? (
          <ApprovalTemplateEntry
            botSlug={botSlug}
            actions={actions}
            disabled={loading || busy !== undefined}
            t={t}
          />
        ) : null}
      </SettingsRows>
      {composerOnly || rules.length === 0 ? null : (
        <details className="bh-workspace-folder-secondary">
          <FolderSectionSummary>{t('approval.rulesTitle')}</FolderSectionSummary>
          <div className="bh-workspace-folder-table">
            {rules.map((rule) => (
              <div key={rule.id} className="bh-workspace-folder-row">
                <div className="bh-workspace-folder-main">
                  <span className="bh-workspace-folder-toggle">
                    {rule.kind === 'exact'
                      ? t('approval.exactRule', { tool: rule.toolName })
                      : rule.kind === 'secret-cli'
                        ? t('approval.secretCliRule', secretCliRuleLabel(rule.input))
                        : t('approval.allRule')}
                    {' · '}
                    {rule.role === 'assignment'
                      ? t('approval.assignment')
                      : t('approval.orchestrator')}
                    {' · '}
                    <Tag>{t(rule.revokedAt ? 'approval.ruleInactive' : 'approval.ruleActive')}</Tag>
                  </span>
                  <button
                    type="button"
                    className="bh-workspace-folder-remove"
                    aria-label={t('approval.revokeRule')}
                    disabled={busy !== undefined || rule.revokedAt !== undefined}
                    onClick={() =>
                      mutate(rule.id, () => actions.revokeToolApprovalRule(botSlug, rule.id))
                    }
                  >
                    <IconCloseOutlineRegular />
                  </button>
                </div>
                <details className="bh-workspace-folder-secondary">
                  <FolderSectionSummary>{t('approval.ruleDetails')}</FolderSectionSummary>
                  <div className="bh-note">
                    {t('approval.cwd', { path: approvalRulePath(rule) })}
                  </div>
                  <div className="bh-note">{t('approval.ruleScope')}</div>
                  <pre className="bh-tool-approval-input">{rule.scopeKey}</pre>
                  {rule.externalCreator ? (
                    <div className="bh-note">
                      {t('approval.externalCreator', { actor: rule.externalCreator.actorId })}
                    </div>
                  ) : null}
                  {rule.kind !== 'all-opaque' ? (
                    <pre className="bh-tool-approval-input">{rule.input}</pre>
                  ) : null}
                </details>
              </div>
            ))}
          </div>
        </details>
      )}
      {pendingGrant === undefined ? null : (
        <WorkspaceGrantConfirmation
          title={t('composerContext.confirmGrant', { name: botName ?? botSlug })}
        >
          <p>{t('composerContext.grantScope', { path: pendingGrant.path })}</p>
          <Button
            disabled={busy !== undefined}
            onClick={() =>
              mutate('confirm-folder', async () => {
                const grant =
                  pendingGrant.workspaceId === undefined
                    ? await actions.authorizeWorkspacePath(botSlug, pendingGrant.path)
                    : await actions.createWorkspaceGrant(botSlug, pendingGrant.workspaceId);
                showGrant(await writableByDefault(grant));
                if (activeSlug.current === botSlug) {
                  setPendingGrant(undefined);
                  setBrowserListing(undefined);
                  setManualPath('');
                }
              })
            }
          >
            {t('grant.authorize')}
          </Button>
          <Button disabled={busy !== undefined} onClick={() => setPendingGrant(undefined)}>
            {t('approval.cancel')}
          </Button>
        </WorkspaceGrantConfirmation>
      )}
      {browserListing === undefined ? null : (
        <FolderBrowser
          initial={browserListing}
          actions={actions}
          onCancel={() => setBrowserListing(undefined)}
          onChoose={(path) => {
            if (composerOnly) {
              if (activeSlug.current === botSlug) {
                setPendingGrant({ path });
                setBrowserListing(undefined);
              }
              return;
            }
            mutate('browse-folder', async () => {
              showGrant(
                await writableByDefault(await actions.authorizeWorkspacePath(botSlug, path)),
              );
              if (activeSlug.current === botSlug) setBrowserListing(undefined);
            });
          }}
          busy={busy !== undefined}
          t={t}
        />
      )}
    </div>
  );
}

export function WorkspaceFolderPicker({
  actions,
  t,
  disabled,
  workspaces,
  rows,
  listLabel,
  onChoose,
}: {
  actions: ChannelSidebarEntryProps['actions'];
  t: ChannelSidebarEntryProps['t'];
  disabled: boolean;
  workspaces: WorkspaceOption[];
  rows?: ReactNode;
  listLabel?: string;
  onChoose(path: string, workspaceId?: string): void;
}): ReactElement {
  const [manualPath, setManualPath] = useState('');
  const [listing, setListing] = useState<HostDirectoryListing>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const resolve = (load: () => Promise<string | null>, workspaceId?: string): void => {
    if (busy || disabled) return;
    setBusy(true);
    setError(undefined);
    void withWorkspaceActionDeadline(
      (async () => {
        const path = await load();
        if (path === null) return;
        const resolved = await actions.resolveWorkspaceFolder(path);
        if (!active.current) return;
        onChoose(resolved.path, workspaceId);
      })(),
      t('grant.loadTimeout'),
    )
      .catch((cause: unknown) => {
        if (active.current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active.current) setBusy(false);
      });
  };
  const browse = (): void => {
    if (busy || disabled) return;
    setBusy(true);
    setError(undefined);
    void withWorkspaceActionDeadline(actions.listHostFolders(), t('grant.loadTimeout'))
      .then((value) => {
        if (active.current) setListing(value);
      })
      .catch(async (cause: unknown) => {
        if (!active.current) return;
        if (!pickerUnavailable(cause)) {
          setError(errorMessage(cause));
          return;
        }
        try {
          const path = await withWorkspaceActionDeadline(
            actions.pickWorkspaceFolder(),
            t('grant.loadTimeout'),
          );
          if (active.current && path !== null) {
            const resolved = await withWorkspaceActionDeadline(
              actions.resolveWorkspaceFolder(path),
              t('grant.loadTimeout'),
            );
            if (active.current) onChoose(resolved.path);
          }
        } catch (nativeCause) {
          if (active.current) setError(errorMessage(nativeCause));
        }
      })
      .finally(() => {
        if (active.current) setBusy(false);
      });
  };
  return (
    <div ref={mount}>
      <SidebarCardList className="bh-workspace-folder-table" label={listLabel}>
        {rows}
        <AddFolderRow label={t('grant.addFolder')} disabled={disabled || busy} onAdd={browse} />
      </SidebarCardList>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      <details className="bh-workspace-folder-secondary">
        <FolderSectionSummary>{t('grant.enterPath')}</FolderSectionSummary>
        <div className="bh-workspace-folder-manual">
          <div className="bh-note">{t('grant.pathHelp')}</div>
          <Input
            aria-label={t('grant.pathLabel')}
            placeholder={t('grant.pathPlaceholder')}
            value={manualPath}
            disabled={disabled || busy}
            onChange={(event) => setManualPath(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={disabled || busy || manualPath.trim().length === 0}
            onClick={() => resolve(async () => manualPath.trim())}
          >
            {t('grant.authorize')}
          </Button>
        </div>
      </details>
      {workspaces.length === 0 ? null : (
        <details className="bh-workspace-folder-secondary">
          <FolderSectionSummary>{t('grant.registeredFolders')}</FolderSectionSummary>
          <SidebarCardList className="bh-workspace-folder-table">
            {workspaces.map((workspace) => (
              <FolderRow
                key={workspace.id}
                name={workspace.title}
                path={workspace.path}
                detail={
                  <Button
                    variant="outline"
                    disabled={disabled || busy}
                    onClick={() => resolve(async () => workspace.path, workspace.id)}
                  >
                    {t('grant.authorize')}
                  </Button>
                }
              />
            ))}
          </SidebarCardList>
        </details>
      )}
      {listing === undefined ? null : (
        <FolderBrowser
          initial={listing}
          actions={actions}
          t={t}
          busy={disabled || busy}
          onCancel={() => setListing(undefined)}
          onChoose={(path) => {
            setListing(undefined);
            resolve(async () => path);
          }}
        />
      )}
    </div>
  );
}

export function WorkspaceGrantConfirmation({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="bh-workspace-grant-confirm" role="group" aria-label={title}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}
