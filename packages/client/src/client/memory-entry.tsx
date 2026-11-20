import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { PointerMenu } from './ds/pointer-menu.js';
import { PanelEmptyState } from './ds/empty-state.js';
import {
  Fragment,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import {
  layoutMemoryGitLanes,
  memoryGraphLaneX,
  memoryGraphRailPath,
  MEMORY_GRAPH_LANE_WIDTH,
  MEMORY_GRAPH_NODE_Y,
  MEMORY_GRAPH_ROW_HEIGHT,
} from './memory-git-lanes.js';
import { MemoryWorkingGroups } from './memory-working-groups.js';
import { MessagingHelp } from './messaging-help.js';
import { memoryViewSnapshot, subscribeMemoryView } from './memory-view-prefs.js';

import { cachedMemory, invalidateMemory } from './memory-read-cache.js';
import { MemoryLoadFeedback } from './memory-load-feedback.js';
import { useMemoryReads } from './use-memory-reads.js';
import { renderMemoryRestoreConfirm } from './memory-restore-confirm.js';

export function MemoryEntry(
  props: ChannelSidebarEntryProps & { showFiles?: boolean },
): ReactElement {
  return <MemoryEntryForScope key={cachedMemory(props.actions, props.channelId).key} {...props} />;
}

function MemoryEntryForScope({
  actions,
  channelId,
  conversationRevision,
  onMemoryCommitSelect,
  selectedMemoryCommitSha,
  onMemoryWorkingSelect,
  selectedMemoryWorking,
  t,
  refreshRevision,
  showFiles = true,
}: ChannelSidebarEntryProps & { showFiles?: boolean }): ReactElement {
  const [openBranch, setOpenBranch] = useState<string>();
  const [branchRequest, setBranchRequest] = useState<string>();
  const [commitMenu, setCommitMenu] = useState<{
    sha: string;
    x: number;
    y: number;
    returnFocus: HTMLElement;
  }>();
  const [continueForm, setContinueForm] = useState<{
    sha: string;
    branch: string;
  }>();
  const [restoreForm, setRestoreForm] = useState<{
    sha: string;
    name: string;
  }>();
  const [nameForm, setNameForm] = useState<{ sha: string; name: string }>();
  const [restored, setRestored] = useState<{
    sha: string;
    backup: string | null;
    version: string | null;
  }>();
  const view = useSyncExternalStore(subscribeMemoryView, memoryViewSnapshot, memoryViewSnapshot);
  const [openVersion, setOpenVersion] = useState<string>();
  const commitMenuAnchor = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [repairArchive, setRepairArchive] = useState<string>();
  const {
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
  } = useMemoryReads({ actions, channelId, refreshRevision, conversationRevision, showFiles });
  const lanes = layoutMemoryGitLanes(graph?.commits ?? []);

  const requestBranchSwitch = async (target: string): Promise<void> => {
    if (graph === undefined || target === graph.currentBranch || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const sent = await actions.send(
        t('memory.branchSwitchPrompt', { branch: JSON.stringify(target) }),
        undefined,
        undefined,
        target,
      );
      if (!sent) throw new Error(t('memory.branchRequestFailed'));
      setBranchRequest(target);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const openCommitMenu = (
    sha: string,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ): void => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = 'clientX' in event && event.type === 'contextmenu';
    setCommitMenu({
      sha,
      x: pointer ? event.clientX : rect.left,
      y: pointer ? event.clientY : rect.bottom,
      returnFocus: event.currentTarget,
    });
  };

  const requestContinue = async (): Promise<void> => {
    if (continueForm === undefined || continueForm.branch.trim() === '' || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const sent = await actions.send(
        t('memory.continuePrompt', {
          sha: continueForm.sha,
          branch: JSON.stringify(continueForm.branch.trim()),
          path: JSON.stringify('MEMORY.md'),
        }),
      );
      if (!sent) throw new Error(t('memory.branchRequestFailed'));
      setBranchRequest(continueForm.branch.trim());
      setContinueForm(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const forgetMemory = (): void => {
    memoryRequestGeneration.current += 1;
    invalidateMemory(cache);
    setRefresh((value) => value + 1);
  };

  const nameVersion = async (): Promise<void> => {
    if (nameForm === undefined || nameForm.name.trim() === '' || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await actions.memoryNameVersion({
        channelId,
        sha: nameForm.sha,
        name: nameForm.name.trim(),
      });
      setNameForm(undefined);
      forgetMemory();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const removeVersionName = async (tag: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await actions.memoryRemoveVersionName({ channelId, tag });
      forgetMemory();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const restoreConfirm = (sha: string, dirty: boolean): ReactElement =>
    renderMemoryRestoreConfirm({ sha, dirty, t, restoreForm, busy, setRestoreForm, restoreCommit });

  const restoreCommit = async (): Promise<void> => {
    if (restoreForm === undefined || graph === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await actions.memoryRestoreCommit({
        channelId,
        sha: restoreForm.sha,
        expectedHead: graph.head,
        restoreId: crypto.randomUUID(),
        ...(restoreForm.name.trim() === '' ? {} : { name: restoreForm.name.trim() }),
      });
      setRestored({
        sha: restoreForm.sha,
        backup: result.backup,
        version: result.version?.name ?? null,
      });
      setRestoreForm(undefined);
      forgetMemory();
      onMemoryCommitSelect?.(result.head);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (file === undefined || file.binary || busy || draft === file.body) return;
    setBusy(true);
    setError(undefined);
    try {
      const commit = await actions.memorySave({
        channelId,
        path: file.path,
        body: draft,
        expectedHead: file.head,
        editId: crypto.randomUUID(),
      });
      memoryRequestGeneration.current += 1;
      const savedFile = { ...file, body: draft, head: commit.sha };
      cache.files.set(file.path, savedFile);
      setFile(savedFile);
      draftState.current.body = draft;
      if (snapshot !== undefined) {
        const savedSnapshot = { ...snapshot, head: commit.sha };
        cache.snapshot = savedSnapshot;
        setSnapshot(savedSnapshot);
      }
      onMemoryCommitSelect?.(commit.sha);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const repair = async (): Promise<void> => {
    if (snapshot?.head === null || snapshot?.head === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await actions.memoryRepair({
        channelId,
        expectedHead: snapshot.head,
        repairId: crypto.randomUUID(),
      });
      memoryRequestGeneration.current += 1;
      invalidateMemory(cache);
      setSnapshot(undefined);
      setGraph(undefined);
      setWorking([]);
      setWorkingLoaded(false);
      setFile(undefined);
      setPath(undefined);
      setRepairArchive(result.backupPath);
      setConfirmRepair(false);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bh-memory-entry" ref={graphMount}>
      {showFiles ? (
        <div className="bh-memory-toolbar" ref={fileMount}>
          <span>{t('memory.accepted')}</span>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            {t('memory.refresh')}
          </button>
        </div>
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {showFiles ? (
        <MemoryLoadFeedback
          error={snapshotError}
          loaded={snapshot !== undefined}
          pending={snapshotPending}
          onRetry={() => setRefresh((value) => value + 1)}
          t={t}
        />
      ) : null}
      {!showFiles ? null : snapshot === undefined ? (
        snapshotError === undefined ? (
          <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
        ) : null
      ) : (
        <>
          {snapshot.provisional ? (
            <div className="bh-note" role="status">
              {t('memory.provisional')}
              {confirmRepair ? (
                <div>
                  <p>{t('memory.repairConfirm')}</p>
                  <button type="button" disabled={busy} onClick={() => void repair()}>
                    {busy ? t('memory.repairing') : t('memory.repairCommit')}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmRepair(false)}>
                    {t('memory.repairCancel')}
                  </button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirmRepair(true)}>
                  {t('memory.repair')}
                </button>
              )}
            </div>
          ) : null}
          {repairArchive === undefined ? null : (
            <div className="bh-note" role="status">
              {t('memory.repairDone')} {repairArchive}
            </div>
          )}
          {showFiles &&
            (snapshot.files.length === 0 ? (
              <PanelEmptyState icon="brain">{t('memory.empty')}</PanelEmptyState>
            ) : (
              <div className="bh-memory-files">
                {snapshot.files.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === path ? 'bh-memory-row bh-memory-row-selected' : 'bh-memory-row'
                    }
                    aria-pressed={item === path}
                    onClick={() => setPath(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ))}
          {showFiles &&
            (file === undefined ? null : (
              <div className="bh-memory-editor">
                <label htmlFor="bh-memory-editor-body">{file.path}</label>
                {file.binary ? (
                  <div className="bh-note">{t('memory.binaryPreview')}</div>
                ) : (
                  <textarea
                    id="bh-memory-editor-body"
                    value={draft}
                    onChange={(event) => {
                      draftState.current.value = event.target.value;
                      draftState.current.version += 1;
                      setDraft(event.target.value);
                    }}
                    spellCheck={false}
                  />
                )}
                <button
                  type="button"
                  disabled={busy || file.binary || draft === file.body || snapshot.provisional}
                  onClick={() => void save()}
                >
                  {busy ? t('memory.saving') : t('memory.save')}
                </button>
              </div>
            ))}
        </>
      )}
      <div className="bh-memory-history" ref={workingMount}>
        <MemoryLoadFeedback
          error={graphError}
          loaded={graph !== undefined}
          pending={graphPending}
          onRetry={() => setRefresh((value) => value + 1)}
          t={t}
        />
        {graph === undefined ? (
          graphError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
          ) : null
        ) : (
          <>
            {!showFiles ? (
              <>
                <MemoryLoadFeedback
                  error={workingError}
                  loaded={workingLoaded}
                  pending={workingPending}
                  onRetry={() => setRefresh((value) => value + 1)}
                  t={t}
                />
                {workingLoaded ? (
                  <MemoryWorkingGroups
                    changes={working}
                    selected={selectedMemoryWorking}
                    onSelect={onMemoryWorkingSelect}
                    t={t}
                  />
                ) : workingError === undefined ? (
                  <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
                ) : null}
              </>
            ) : null}
            {branchRequest === undefined || branchRequest === graph.currentBranch ? null : (
              <div className="bh-note" role="status">
                {t('memory.branchRequested')} {branchRequest}
              </div>
            )}
            {restored === undefined ? null : (
              <div className="bh-note bh-memory-restore-done" role="status">
                {t('memory.restoreCommit.done', {
                  sha: restored.sha.slice(0, 7),
                })}
                {restored.backup === null && restored.version === null ? null : (
                  <MessagingHelp
                    title={t('memory.restoreCommit.done', {
                      sha: restored.sha.slice(0, 7),
                    })}
                    text={`${
                      restored.backup === null
                        ? ''
                        : t('memory.restoreCommit.backedUp', {
                            sha: restored.backup.slice(0, 7),
                          })
                    }${
                      restored.version === null
                        ? ''
                        : t('memory.restoreCommit.named', {
                            name: restored.version,
                          })
                    }`.trim()}
                    t={t}
                  />
                )}
              </div>
            )}
            {commitMenu === undefined ? null : (
              <span hidden>
                <PointerMenu
                  point={commitMenu}
                  dense
                  autoFocus
                  anchor={<span ref={commitMenuAnchor} aria-hidden="true" />}
                  items={[
                    ...(commitMenu.sha === graph.head
                      ? []
                      : [
                          {
                            id: 'restore',
                            label: t('memory.restoreCommit.menu'),
                          },
                        ]),
                    { id: 'name', label: t('memory.version.action') },
                    { id: 'continue', label: t('memory.continueHere') },
                  ]}
                  onSelect={(id) => {
                    if (id === 'restore') {
                      setContinueForm(undefined);
                      setNameForm(undefined);
                      setRestoreForm({ sha: commitMenu.sha, name: '' });
                    } else if (id === 'name') {
                      setContinueForm(undefined);
                      setRestoreForm(undefined);
                      setNameForm({ sha: commitMenu.sha, name: '' });
                    } else {
                      setRestoreForm(undefined);
                      setContinueForm({
                        sha: commitMenu.sha,
                        branch: 'memory-' + commitMenu.sha.slice(0, 7),
                      });
                    }
                    setCommitMenu(undefined);
                  }}
                  onClose={() => {
                    commitMenu.returnFocus.focus();
                    setCommitMenu(undefined);
                  }}
                />
              </span>
            )}
            {view === 'branches' ? (
              <div
                className="bh-memory-version-list"
                role="list"
                aria-label={t('memory.view.branches')}
              >
                {graph.branches.length === 0 ? (
                  <PanelEmptyState icon="git-branch">{t('memory.branches.empty')}</PanelEmptyState>
                ) : (
                  graph.branches.map((branch) => {
                    const open = openBranch === branch;
                    const current = branch === graph.currentBranch;
                    const tip = graph.commits.find((commit) => commit.branches.includes(branch));
                    return (
                      <Fragment key={branch}>
                        <button
                          type="button"
                          role="listitem"
                          className="bh-memory-version-row"
                          aria-expanded={open}
                          data-expanded={open || undefined}
                          onClick={() => {
                            setOpenBranch(open ? undefined : branch);
                            if (tip !== undefined) onMemoryCommitSelect?.(tip.sha);
                          }}
                        >
                          <span className="bh-memory-version-name" data-branch="">
                            {branch}
                          </span>
                          <span className="bh-memory-graph-detail">
                            {tip === undefined ? null : (
                              <span className="bh-memory-graph-hash">{tip.sha.slice(0, 7)}</span>
                            )}
                            {current ? (
                              <span className="bh-memory-graph-head-label">
                                {t('memory.versions.current')}
                              </span>
                            ) : null}
                          </span>
                          {tip === undefined ? null : (
                            <span className="bh-memory-version-subject">{tip.subject}</span>
                          )}
                        </button>
                        {!open || current ? null : (
                          <div className="bh-memory-version-panel">
                            <div className="bh-memory-restore-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void requestBranchSwitch(branch)}
                              >
                                {t('memory.branches.switch')}
                              </Button>
                              <MessagingHelp
                                title={t('memory.branches.switch')}
                                text={`${t('memory.branches.switchHelp')}${
                                  graph.dirty ? t('memory.branches.dirtyHelp') : ''
                                }`}
                                t={t}
                              />
                            </div>
                          </div>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </div>
            ) : view === 'versions' ? (
              <div
                className="bh-memory-version-list"
                role="list"
                aria-label={t('memory.view.versions')}
                ref={versionsMount}
              >
                {versionsError === undefined ? null : (
                  <div className="bh-error" role="alert">
                    {versionsError}
                  </div>
                )}
                {versions === undefined ? (
                  versionsError === undefined ? (
                    <LoadingSkeleton kind="sidebar" label={t('memory.loading')} />
                  ) : null
                ) : versions.length === 0 ? (
                  <PanelEmptyState icon="git-branch">{t('memory.versions.empty')}</PanelEmptyState>
                ) : (
                  versions.map((version) => {
                    const open = openVersion === version.tag;
                    return (
                      <Fragment key={version.tag}>
                        <button
                          type="button"
                          role="listitem"
                          className={
                            version.sha === selectedMemoryCommitSha
                              ? 'bh-memory-version-row bh-memory-row-selected'
                              : 'bh-memory-version-row'
                          }
                          aria-expanded={open}
                          data-expanded={open || undefined}
                          title={version.tag}
                          onClick={() => {
                            setOpenVersion(open ? undefined : version.tag);
                            setRestoreForm(undefined);
                            onMemoryCommitSelect?.(version.sha);
                          }}
                        >
                          <span className="bh-memory-version-name">{version.name}</span>
                          <span className="bh-memory-graph-detail">
                            <span className="bh-memory-graph-hash">{version.sha.slice(0, 7)}</span>
                            {version.sha === graph.head ? (
                              <span className="bh-memory-graph-head-label">
                                {t('memory.versions.current')}
                              </span>
                            ) : null}
                            <span>{new Date(version.namedAt).toLocaleString()}</span>
                          </span>
                          <span className="bh-memory-version-subject">{version.subject}</span>
                        </button>
                        {!open ? null : (
                          <div className="bh-memory-version-panel">
                            {restoreForm?.sha === version.sha ? (
                              restoreConfirm(version.sha, graph.dirty)
                            ) : (
                              <div className="bh-memory-restore-actions">
                                {version.sha === graph.head ? null : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() =>
                                      setRestoreForm({
                                        sha: version.sha,
                                        name: '',
                                      })
                                    }
                                  >
                                    {t('memory.versions.restore')}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => void removeVersionName(version.tag)}
                                >
                                  {t('memory.versions.removeName')}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </div>
            ) : (
              <>
                <div className="bh-memory-graph-list" role="list" aria-label={t('memory.gitGraph')}>
                  {graph.commits.map((commit, index) => {
                    const row = lanes[index]!;
                    const width = row.width * MEMORY_GRAPH_LANE_WIDTH;
                    const restorePanel =
                      continueForm?.sha !== commit.sha &&
                      (restoreForm?.sha === commit.sha ||
                        nameForm?.sha === commit.sha ||
                        commit.sha === selectedMemoryCommitSha);
                    return (
                      <Fragment key={commit.sha}>
                        <button
                          type="button"
                          role="listitem"
                          className={
                            commit.sha === selectedMemoryCommitSha
                              ? 'bh-memory-graph-row bh-memory-row-selected'
                              : 'bh-memory-graph-row'
                          }
                          aria-pressed={commit.sha === selectedMemoryCommitSha}
                          data-expanded={restorePanel || undefined}
                          onClick={() => onMemoryCommitSelect?.(commit.sha)}
                          onContextMenu={(event) => openCommitMenu(commit.sha, event)}
                          onKeyDown={(event) => {
                            if (
                              event.key === 'ContextMenu' ||
                              (event.shiftKey && event.key === 'F10')
                            )
                              openCommitMenu(commit.sha, event);
                          }}
                          title={commit.sha}
                        >
                          <svg
                            className="bh-memory-graph-svg"
                            width={width}
                            height={MEMORY_GRAPH_ROW_HEIGHT}
                            viewBox={'0 0 ' + width + ' ' + MEMORY_GRAPH_ROW_HEIGHT}
                            aria-hidden="true"
                          >
                            {row.through.map((lane) => (
                              <path
                                key={'through-' + lane}
                                data-lane={lane % 4}
                                d={
                                  'M ' +
                                  memoryGraphLaneX(lane) +
                                  ' -0.5 V ' +
                                  (MEMORY_GRAPH_ROW_HEIGHT + 0.5)
                                }
                              />
                            ))}
                            {row.fromAbove ? (
                              <path
                                data-lane={row.lane % 4}
                                d={
                                  'M ' +
                                  memoryGraphLaneX(row.lane) +
                                  ' -0.5 V ' +
                                  MEMORY_GRAPH_NODE_Y
                                }
                              />
                            ) : null}
                            {row.joins.map((lane) => (
                              <path
                                key={'join-' + lane}
                                data-lane={lane % 4}
                                d={memoryGraphRailPath(lane, row.lane, 'incoming')}
                              />
                            ))}
                            {row.toParents.map((lane, parentIndex) => (
                              <path
                                key={'parent-' + parentIndex}
                                data-lane={lane % 4}
                                d={memoryGraphRailPath(row.lane, lane, 'outgoing')}
                              />
                            ))}
                            <circle
                              cx={memoryGraphLaneX(row.lane)}
                              cy={MEMORY_GRAPH_NODE_Y}
                              r={commit.sha === graph.head ? 4 : 3.5}
                              data-lane={row.lane % 4}
                              data-head={commit.sha === graph.head || undefined}
                            />
                          </svg>
                          <span className="bh-memory-graph-text">
                            <span className="bh-memory-graph-top">
                              <span className="bh-memory-graph-subject">{commit.subject}</span>
                              {(commit.versions ?? []).map((version) => (
                                <span
                                  key={'version-' + version.tag}
                                  className="bh-memory-version"
                                  title={version.name}
                                >
                                  {version.name}
                                </span>
                              ))}
                              {commit.branches.map((branch) => (
                                <span
                                  key={branch}
                                  className="bh-memory-ref"
                                  data-current={branch === graph.currentBranch || undefined}
                                  title={branch}
                                >
                                  {branch}
                                </span>
                              ))}
                            </span>
                            <span className="bh-memory-graph-detail">
                              <span className="bh-memory-graph-hash">{commit.sha.slice(0, 7)}</span>
                              {commit.sha === graph.head ? (
                                <span className="bh-memory-graph-head-label">HEAD</span>
                              ) : null}
                              <span
                                className={
                                  'bh-memory-commit-status bh-memory-commit-status-' + commit.status
                                }
                              >
                                {commit.status === 'accepted'
                                  ? t('memory.gitStatus.accepted')
                                  : commit.status === 'needs-repair'
                                    ? t('memory.gitStatus.needs-repair')
                                    : t('memory.gitStatus.pending')}
                              </span>
                            </span>
                          </span>
                        </button>
                        {!restorePanel ? null : (
                          <div className="bh-memory-graph-panel">
                            <span className="bh-memory-graph-rail" style={{ width }}>
                              <svg className="bh-memory-graph-svg" width={width} aria-hidden="true">
                                {[...new Set([...row.through, ...row.toParents])].map((lane) => (
                                  <path
                                    key={'rail-' + lane}
                                    data-lane={lane % 4}
                                    d={'M ' + memoryGraphLaneX(lane) + ' 0 V 2000'}
                                  />
                                ))}
                              </svg>
                            </span>
                            {restoreForm?.sha === commit.sha ? (
                              restoreConfirm(commit.sha, graph.dirty)
                            ) : nameForm?.sha === commit.sha ? (
                              <form
                                className="bh-memory-restore-confirm"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void nameVersion();
                                }}
                              >
                                <label className="bh-memory-restore-note">
                                  <span>
                                    {t('memory.version.label')}
                                    {commit.sha === graph.head && graph.dirty ? (
                                      <MessagingHelp
                                        title={t('memory.version.label')}
                                        text={t('memory.version.dirtyHint')}
                                        t={t}
                                      />
                                    ) : null}
                                  </span>
                                  <Input
                                    autoFocus
                                    value={nameForm.name}
                                    maxLength={60}
                                    placeholder={t('memory.version.placeholder')}
                                    disabled={busy}
                                    onChange={(event) =>
                                      setNameForm({
                                        sha: commit.sha,
                                        name: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <Button
                                  type="submit"
                                  variant="primary"
                                  size="sm"
                                  disabled={busy || nameForm.name.trim() === ''}
                                >
                                  {t('memory.version.save')}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => setNameForm(undefined)}
                                >
                                  {t('common.cancel')}
                                </Button>
                              </form>
                            ) : (
                              <div className="bh-memory-restore-offer">
                                {(commit.versions ?? []).map((version) => (
                                  <span key={version.tag} className="bh-memory-version-chip">
                                    <span title={version.tag}>{version.name}</span>
                                    <button
                                      type="button"
                                      aria-label={t('memory.version.remove', {
                                        name: version.name,
                                      })}
                                      disabled={busy}
                                      onClick={() => void removeVersionName(version.tag)}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                <span className="bh-memory-restore-actions">
                                  {commit.sha === graph.head ? null : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => {
                                        setContinueForm(undefined);
                                        setNameForm(undefined);
                                        setRestoreForm({
                                          sha: commit.sha,
                                          name: '',
                                        });
                                      }}
                                    >
                                      {t('memory.restoreCommit.action')}
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => {
                                      setRestoreForm(undefined);
                                      setNameForm({
                                        sha: commit.sha,
                                        name: '',
                                      });
                                    }}
                                  >
                                    {t('memory.version.action')}
                                  </Button>
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {continueForm?.sha !== commit.sha ? null : (
                          <form
                            className="bh-memory-continue-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void requestContinue();
                            }}
                          >
                            <label htmlFor="bh-memory-new-branch">
                              {t('memory.newBranch')} · <code>{continueForm.sha.slice(0, 7)}</code>
                            </label>
                            <Input
                              id="bh-memory-new-branch"
                              autoFocus
                              value={continueForm.branch}
                              onChange={(event) =>
                                setContinueForm({
                                  ...continueForm,
                                  branch: event.currentTarget.value,
                                })
                              }
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              type="submit"
                              disabled={busy || continueForm.branch.trim() === ''}
                            >
                              {t('memory.createAndSwitch')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              onClick={() => setContinueForm(undefined)}
                            >
                              {t('common.cancel')}
                            </Button>
                          </form>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
                {graph.hasMore ? (
                  <button
                    type="button"
                    className="bh-memory-graph-more"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? t('memory.loading') : t('memory.loadMore')}
                  </button>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
