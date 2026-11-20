import type { ComponentProps, ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type {
  FolderRow as FolderRowComponent,
  WorkspaceFolderPicker as FolderPickerComponent,
} from './workspace-grants-entry.js';
import {
  cachedWorkspace,
  rememberWorkspace,
  type useWorkspaceGrants,
} from './use-workspace-grants.js';
import { AddFolderRow, FolderSectionSummary } from './workspace-grant-row-controls.js';
import { MemoryFileActionButton, MemoryFileOpenButton } from './memory-file-actions.js';
import { WorkspaceFileOpenButton, WorkspaceFilePathButton } from './workspace-file-actions.js';
import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { Switch } from './ds/switch.js';
import { SettingsSection } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import { isAbsoluteHostPath } from './persona-bot-create.js';
import { SidebarCardList } from './sidebar-card.js';

const memoryMoveStyles = stylex.create({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
  },
  grow: { flexGrow: 1, minWidth: 0 },
});

export function renderWorkspaceGrantFolders({
  actions,
  t,
  botSlug,
  developerMode,
  composerOnly,
  state,
  stackProps,
  FolderRow,
  WorkspaceFolderPicker,
}: Pick<ChannelSidebarEntryProps, 'actions' | 't'> & {
  botSlug: string;
  developerMode: boolean;
  composerOnly: boolean;
  state: ReturnType<typeof useWorkspaceGrants>;
  stackProps: Pick<ComponentProps<'div'>, 'className' | 'style'>;
  FolderRow: typeof FolderRowComponent;
  WorkspaceFolderPicker: typeof FolderPickerComponent;
}): ReactElement {
  const {
    workspaces,
    grants,
    setGrants,
    activeSlug,
    busy,
    memoryDir,
    memoryLocation,
    setMemoryLocation,
    chooseMemoryLocation,
    moveMemory,
    mutate,
    openFolderBrowser,
    setPendingGrant,
    manualOpen,
    setManualOpen,
    manualPath,
    setManualPath,
    previewFolder,
    showGrant,
    writableByDefault,
  } = state;
  const active = grants.filter((grant) => grant.revokedAt === undefined);
  const revoked = grants.filter((grant) => grant.revokedAt !== undefined);
  const activeIds = new Set(active.map((grant) => grant.workspaceId));
  const available = workspaces.filter((workspace) => !activeIds.has(workspace.id));

  return (
    <SettingsSection title={t('grant.section')}>
      <div {...stackProps}>
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
                                const current = cachedWorkspace(actions, botSlug)?.grants ?? grants;
                                const next = current.map((row) =>
                                  row.id === updated.id ? updated : row,
                                );
                                rememberWorkspace(actions, botSlug, {
                                  grants: next,
                                });
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
                        rememberWorkspace(actions, botSlug, {
                          grants: next,
                        });
                        if (activeSlug.current === botSlug) setGrants(next);
                      })
                    }
                  />
                ))}
              </>
            }
            onChoose={(path, workspaceId) =>
              setPendingGrant({
                path,
                ...(workspaceId === undefined ? {} : { workspaceId }),
              })
            }
          />
        ) : (
          <SidebarCardList className="bh-workspace-folder-table" label={t('entry.workspaceGrants')}>
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
                        disabled={busy !== undefined || !isAbsoluteHostPath(memoryLocation.trim())}
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
                            rememberWorkspace(actions, botSlug, {
                              grants: next,
                            });
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
                          setPendingGrant({
                            path: workspace.path,
                            workspaceId: workspace.id,
                          });
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
                <FolderRow key={grant.id} name={grant.workspaceTitle} path={grant.workspacePath} />
              ))}
            </SidebarCardList>
          </details>
        )}
      </div>
    </SettingsSection>
  );
}
