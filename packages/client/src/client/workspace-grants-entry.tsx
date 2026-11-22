import { Icon } from './ds/icon.js';
import { Tag } from './ds/tag.js';
import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { Switch } from './ds/switch.js';
import { useId, useRef, useState, type ReactElement, type ReactNode } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { HostDirectoryListing } from './actions.js';
import type { WorkspaceOption, ToolApprovalRuleView } from './bridge.js';
import { errorMessage } from './bridge.js';
import { isAbsoluteHostPath } from './persona-bot-create.js';
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
import { publishWorkspaceGrantChange } from './workspace-grant-events.js';

export { WORKSPACE_GRANTS_CHANGED } from './workspace-grant-events.js';
import { approvalRulePath, secretCliRuleLabel } from './workspace-approval-rule-labels.js';
import { renderWorkspaceGrantFolders } from './workspace-grant-folders.js';
import {
  folderBrowseError,
  pickerUnavailable,
  useWorkspaceGrants,
  withWorkspaceActionDeadline,
} from './use-workspace-grants.js';
import {
  AddFolderRow,
  FolderSectionSummary,
  WorkspaceGrantConfirmation,
} from './workspace-grant-row-controls.js';

export { folderBrowseError, withWorkspaceActionDeadline } from './use-workspace-grants.js';
export {
  AddFolderRow,
  FolderSectionSummary,
  WorkspaceGrantConfirmation,
} from './workspace-grant-row-controls.js';

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
              <Icon name="trash" size={16} />
              {removeText}
            </Button>
          )}
          <Icon
            name="chevron-down"
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

const accessStyles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.x3,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.x2,
  },
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

export interface FolderBrowserActions {
  listHostFolders(
    path?: string,
    signal?: AbortSignal,
    offset?: number,
  ): Promise<Omit<HostDirectoryListing, 'home'>>;
}

type FolderBrowserListing = Omit<HostDirectoryListing, 'home'> & {
  home?: string;
};

const FOLDER_CACHE_MS = 15_000;
const FOLDER_PREFETCH_DELAY_MS = 150;
const FOLDER_SLOW_MS = 800;
const folderCaches = new WeakMap<
  FolderBrowserActions,
  Map<string, { at: number; listing: FolderBrowserListing }>
>();

function folderCache(actions: FolderBrowserActions) {
  let cache = folderCaches.get(actions);
  if (cache === undefined) {
    cache = new Map();
    folderCaches.set(actions, cache);
  }
  return cache;
}

function cachedFolder(
  actions: FolderBrowserActions,
  path: string,
): FolderBrowserListing | undefined {
  const hit = folderCache(actions).get(path);
  return hit !== undefined && Date.now() - hit.at < FOLDER_CACHE_MS ? hit.listing : undefined;
}

function rememberFolder(
  actions: FolderBrowserActions,
  requested: string,
  listing: FolderBrowserListing,
): void {
  const cache = folderCache(actions);
  const entry = { at: Date.now(), listing };
  cache.set(requested, entry);
  cache.set(listing.path, entry);
}

export function FolderBrowser({
  initial,
  actions,
  onCancel,
  onChoose,
  busy,
  t,
}: {
  initial: FolderBrowserListing;
  actions: FolderBrowserActions;
  onCancel: () => void;
  onChoose: (path: string) => void;
  busy: boolean;
  t: ChannelSidebarEntryProps['t'];
}): ReactElement {
  const [listing, setListing] = useState(initial);
  const [location, setLocation] = useState(initial.path);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showHidden, setShowHidden] = useState(false);
  const request = useRef<AbortController | undefined>();
  const prefetch = useRef<{ timer?: number; path?: string; inFlight: boolean }>({
    inFlight: false,
  });

  const abortOnUnmount = useMountedResource<HTMLDivElement>(
    () => () => {
      request.current?.abort();
      window.clearTimeout(prefetch.current.timer);
    },
    [],
  );

  const navigate = (path: string): void => {
    if (busy) return;
    request.current?.abort();
    setError(undefined);
    setMore(false);
    const cached = cachedFolder(actions, path);
    if (cached !== undefined) {
      request.current = undefined;
      setListing(cached);
      setLocation(cached.path);
      setLoading(false);
      setSlow(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setSlow(false);
    const slowTimer = window.setTimeout(() => {
      if (!controller.signal.aborted) setSlow(true);
    }, FOLDER_SLOW_MS);
    void actions
      .listHostFolders(path, controller.signal)
      .then(
        (next) => {
          rememberFolder(actions, path, next);
          if (!controller.signal.aborted) {
            setListing(next);
            setLocation(next.path);
          }
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) setError(folderBrowseError(cause, t));
        },
      )
      .finally(() => {
        window.clearTimeout(slowTimer);
        if (!controller.signal.aborted) {
          setLoading(false);
          setSlow(false);
        }
      });
  };

  const showMore = (): void => {
    const offset = listing.nextOffset;
    if (busy || loading || more || offset === undefined) return;
    const controller = new AbortController();
    request.current = controller;
    setMore(true);
    setError(undefined);
    void actions
      .listHostFolders(listing.path, controller.signal, offset)
      .then(
        (next) => {
          if (controller.signal.aborted || next.path !== listing.path) return;
          const merged = {
            ...next,
            entries: [...listing.entries, ...next.entries],
          };
          rememberFolder(actions, listing.path, merged);
          setListing(merged);
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) setError(folderBrowseError(cause, t));
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setMore(false);
      });
  };

  const warm = (path: string): void => {
    window.clearTimeout(prefetch.current.timer);
    if (busy || cachedFolder(actions, path) !== undefined) return;
    prefetch.current.timer = window.setTimeout(() => {
      if (prefetch.current.inFlight) return;
      prefetch.current.inFlight = true;
      void actions
        .listHostFolders(path)
        .then(
          (next) => rememberFolder(actions, path, next),
          () => undefined,
        )
        .finally(() => {
          prefetch.current.inFlight = false;
        });
    }, FOLDER_PREFETCH_DELAY_MS);
  };
  const cool = (): void => window.clearTimeout(prefetch.current.timer);

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
            disabled={busy || loading || location.trim() !== listing.path || error !== undefined}
            onClick={() => onChoose(listing.path)}
          >
            {t('grant.authorize')}
          </Button>
        </>
      }
    >
      <div role="group" aria-label={t('grant.browseRoots')} {...stylex.props(browserStyles.crumbs)}>
        {(listing.roots ?? []).map((root) => (
          <Button
            key={root.path}
            variant="outline"
            data-folder-browser-root={root.path}
            aria-label={t('grant.browseRoot', {
              name: root.path === listing.home ? t('grant.browseHome') : root.name,
            })}
            disabled={busy}
            onClick={() => navigate(root.path)}
          >
            {root.path === listing.home ? t('grant.browseHome') : root.name}
          </Button>
        ))}
      </div>
      <SettingsRow title={t('grant.browseLocation')} description={t('grant.browsePathHelp')}>
        <Input
          type="text"
          aria-label={t('grant.pathLabel')}
          value={location}
          disabled={busy}
          onChange={(event) => setLocation(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (isAbsoluteHostPath(location.trim())) navigate(location.trim());
            }
          }}
        />
        <Button
          variant="outline"
          disabled={busy || !isAbsoluteHostPath(location.trim())}
          onClick={() => navigate(location.trim())}
        >
          {t('grant.browseGo')}
        </Button>
      </SettingsRow>
      <div
        aria-label={t('grant.browseBreadcrumbs')}
        ref={abortOnUnmount}
        {...stylex.props(browserStyles.crumbs)}
      >
        {listing.crumbs.map((crumb, index) => (
          <button
            type="button"
            key={crumb.path}
            data-folder-browser-crumb=""
            aria-current={index === listing.crumbs.length - 1 ? 'location' : undefined}
            disabled={busy}
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
      <div
        role="list"
        aria-label={t('grant.browseFolders')}
        aria-busy={loading}
        {...stylex.props(browserStyles.list)}
      >
        {listing.entries
          .filter((entry) => showHidden || !entry.hidden)
          .map((entry) => (
            <button
              type="button"
              role="listitem"
              key={entry.path}
              data-folder-browser-item=""
              disabled={busy}
              onClick={() => navigate(entry.path)}
              onPointerEnter={() => warm(entry.path)}
              onPointerLeave={cool}
              onFocus={() => warm(entry.path)}
              onBlur={cool}
              {...stylex.props(browserStyles.item)}
            >
              <Icon name="folder-open" size={16} />
              <span>{entry.name}</span>
            </button>
          ))}
        {listing.entries.length === 0 ? (
          <div {...stylex.props(browserStyles.empty)}>
            <Note>{t('grant.browseEmpty')}</Note>
          </div>
        ) : null}
        {listing.nextOffset === undefined ? null : (
          <div {...stylex.props(browserStyles.empty)}>
            <Button
              variant="ghost"
              data-folder-browser-more=""
              disabled={busy || loading || more}
              onClick={showMore}
            >
              {t('grant.browseMore')}
            </Button>
          </div>
        )}
      </div>
      {listing.truncated && listing.nextOffset === undefined ? (
        <Note>{t('grant.browseTruncated')}</Note>
      ) : null}
      {loading || more ? <LoadingSkeleton kind="sidebar" label={t('grant.loading')} /> : null}
      {slow ? <Note>{t('grant.browseSlow')}</Note> : null}
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
  const state = useWorkspaceGrants({ actions, botSlug, t, composerOnly });
  const {
    grants,
    rules,
    access,
    confirmDanger,
    setConfirmDanger,
    pendingGrant,
    setPendingGrant,
    setManualPath,
    browserListing,
    setBrowserListing,
    busy,
    error,
    loading,
    activeSlug,
    showGrant,
    writableByDefault,
    mount,
    mutate,
  } = state;

  if (botSlug === undefined) return <div className="bh-note">{t('grant.noBot')}</div>;

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
        {renderWorkspaceGrantFolders({
          actions,
          botSlug,
          t,
          developerMode,
          composerOnly,
          state,
          stackProps: stylex.props(accessStyles.stack),
          FolderRow,
          WorkspaceFolderPicker,
        })}
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
                        {
                          value: 'assignments',
                          label: t('access.scopeAssignments'),
                        },
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
      {rules.length === 0 ? null : (
        <details className="bh-workspace-folder-secondary">
          <FolderSectionSummary>{t('approval.rulesTitle')}</FolderSectionSummary>
          <details className="bh-workspace-folder-secondary">
            <FolderSectionSummary>{t('approval.ruleDetails')}</FolderSectionSummary>
            <div className="bh-note">{t('approval.rulesHint')}</div>
          </details>
          <Button
            size="sm"
            variant="toolbar"
            disabled={busy !== undefined}
            onClick={() => publishWorkspaceGrantChange(botSlug, actions)}
          >
            {t('autoApproval.reload')}
          </Button>
          <div className="bh-workspace-folder-table">
            {rules.map((rule) => (
              <div key={rule.id} className="bh-workspace-folder-row" data-tool-rule={rule.id}>
                <div className="bh-workspace-folder-main">
                  <span className="bh-workspace-folder-toggle">
                    <Tag>{t('approval.ruleFromCard')}</Tag>
                    {' · '}
                    {rule.kind === 'tool'
                      ? t('approval.toolRule', { tool: rule.toolName })
                      : rule.kind === 'exact'
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
                    aria-label={t('approval.revokeRule') + ': ' + rule.toolName}
                    disabled={busy !== undefined || rule.revokedAt !== undefined}
                    onClick={() =>
                      mutate(rule.id, () => actions.revokeToolApprovalRule(botSlug, rule.id))
                    }
                  >
                    <Icon name="x" />
                  </button>
                </div>
                <div className="bh-note">{t('approval.cwd', { path: approvalRulePath(rule) })}</div>
                <details className="bh-workspace-folder-secondary">
                  <FolderSectionSummary>{t('approval.ruleDetails')}</FolderSectionSummary>
                  <div className="bh-note">{t('approval.ruleScope')}</div>
                  <pre className="bh-tool-approval-input">{rule.scopeKey}</pre>
                  {rule.externalCreator ? (
                    <div className="bh-note">
                      {t('approval.externalCreator', {
                        actor: rule.externalCreator.actorId,
                      })}
                    </div>
                  ) : null}
                  {rule.kind !== 'all-opaque' && rule.kind !== 'tool' ? (
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
          title={t('composerContext.confirmGrant', {
            name: botName ?? botSlug,
          })}
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
    const pickNatively = async (): Promise<void> => {
      try {
        const path = await actions.pickWorkspaceFolder();
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
    };
    void withWorkspaceActionDeadline(actions.listHostFolders(), t('grant.loadTimeout'))
      .then(async (value) => {
        if (!active.current) return;
        if (value.nativePicker === true) await pickNatively();
        else setListing(value);
      })
      .catch(async (cause: unknown) => {
        if (!active.current) return;
        if (pickerUnavailable(cause)) await pickNatively();
        else setError(folderBrowseError(cause, t));
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
