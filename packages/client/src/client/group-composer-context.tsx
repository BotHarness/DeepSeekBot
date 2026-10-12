import { useRef, useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { AssignmentAccessPresetView, WorkspaceGrantView, WorkspaceOption } from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotSummary, ChannelSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ComposerContext } from './composer-shortcuts.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Modal } from './modal.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { useMountedResource } from './mounted-resource.js';
import {
  WorkspaceFolderPicker,
  FolderRow,
  FolderSectionSummary,
  withWorkspaceActionDeadline,
} from './workspace-grants-entry.js';
import { subscribeWorkspaceGrantChanges } from './workspace-grant-events.js';
import { authorizeGroupMembers, type GroupGrantResult } from './group-workspace-authorization.js';
import { useMobileBotViewport } from './mobile-viewport.js';

interface PreviewMember {
  slug: string;
  name: string;
  grant: WorkspaceGrantView | undefined;
  access: AssignmentAccessPresetView;
}

export function useGroupComposerContext({
  channel,
  members,
  actions,
  t,
}: {
  channel: ChannelSummary | undefined;
  members: BotSummary[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ComposerContext | undefined {
  const [openChannel, setOpenChannel] = useState<string>();
  if (channel?.type !== 'group') return;
  const open = () => setOpenChannel(channel.id);
  return {
    target: channel.id,
    shortcuts: [
      {
        id: 'workspace',
        label: t('grant.addFolder'),
        icon: <ChannelSidebarIcon name="folder-key" />,
        run: open,
      },
    ],
    content: (
      <GroupComposerContextView
        key={channel.id}
        channelId={channel.id}
        members={members.filter((bot) => !bot.deleted && !bot.paused)}
        actions={actions}
        t={t}
        open={openChannel === channel.id}
        onOpen={open}
        onClose={() => setOpenChannel(undefined)}
      />
    ),
  };
}

export function GroupComposerContextView({
  channelId,
  members,
  actions,
  t,
  open,
  onOpen,
  onClose,
}: {
  channelId: string;
  members: BotSummary[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
  open: boolean;
  onOpen(): void;
  onClose(): void;
}): ReactElement {
  const mobile = useMobileBotViewport();
  const [selected, setSelected] = useState<string[]>();
  const [facts, setFacts] = useState<Record<string, WorkspaceGrantView[] | null | undefined>>({});
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [preview, setPreview] = useState<{
    path: string;
    title: string;
    members: PreviewMember[];
  }>();
  const [results, setResults] = useState<GroupGrantResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const current = useRef(0);
  const factRequest = useRef(0);
  const eligible = (selected ?? members.map((bot) => bot.slug)).filter((slug) =>
    members.some((bot) => bot.slug === slug),
  );
  const signature = members.map((bot) => bot.slug).join('|');
  const mount = useMountedResource<HTMLDivElement>(() => {
    current.current += 1;
    return () => {
      current.current += 1;
    };
  }, []);
  const factMount = useMountedResource<HTMLButtonElement>(() => {
    const generation = ++factRequest.current;
    const refresh = (slug: string): void => {
      void actions.listWorkspaceGrants(slug).then(
        (rows) => {
          if (factRequest.current === generation)
            setFacts((value) => ({
              ...value,
              [slug]: rows.filter((grant) => grant.revokedAt === undefined),
            }));
        },
        () => {
          if (factRequest.current === generation) setFacts((value) => ({ ...value, [slug]: null }));
        },
      );
    };
    const slugs = members.map((bot) => bot.slug);
    for (const slug of slugs) refresh(slug);
    if (slugs.length > 0)
      void actions.listWorkspaceOptions().then(
        (rows) => {
          if (factRequest.current === generation) setWorkspaces(rows);
        },
        () => {},
      );
    const disposers = slugs.map((slug) =>
      subscribeWorkspaceGrantChanges(slug, () => refresh(slug)),
    );
    return () => {
      factRequest.current += 1;
      disposers.forEach((dispose) => dispose());
    };
  }, [actions, signature]);
  const choose = (path: string): void => {
    if (busy || eligible.length === 0) return;
    const generation = current.current;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    setResults([]);
    void withWorkspaceActionDeadline(
      (async () => {
        const resolved = await actions.resolveWorkspaceFolder(path);
        const targets = await Promise.all(
          eligible.map(async (slug): Promise<PreviewMember> => ({
            slug,
            name: members.find((bot) => bot.slug === slug)!.displayName,
            grant: await actions.readGroupWorkspaceGrant(channelId, slug, resolved.path),
            access: await actions.assignmentAccess(slug),
          })),
        );
        if (current.current === generation)
          setPreview({ path: resolved.path, title: resolved.title, members: targets });
      })(),
      t('grant.loadTimeout'),
    )
      .catch((cause: unknown) => {
        if (current.current === generation) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current.current === generation) setBusy(false);
      });
  };
  const submit = (): void => {
    if (busy || preview === undefined) return;
    const generation = current.current;
    setBusy(true);
    setError(undefined);
    void authorizeGroupMembers({
      actions,
      channelId,
      path: preview.path,
      slugs: preview.members.map((bot) => bot.slug),
      previous: results,
      deadline: (operation) => withWorkspaceActionDeadline(operation, t('grant.operationTimeout')),
      onResult: (result) => {
        if (current.current === generation)
          setResults((rows) => [...rows.filter((row) => row.slug !== result.slug), result]);
      },
    }).finally(() => {
      if (current.current === generation) setBusy(false);
    });
  };
  const chip = groupWorkspaceChip(
    members.map((bot) => facts[bot.slug]),
    t,
  );
  const retry = results.some((row) => row.status === 'unknown' || row.status === 'failed');
  return (
    <div ref={mount}>
      <div className="bh-composer-context" hidden={mobile} aria-label={t('composerContext.label')}>
        <button ref={factMount} type="button" onClick={onOpen}>
          <ChannelSidebarIcon name="folder-key" size={14} />
          <span>{chip}</span>
        </button>
      </div>
      {open ? (
        <Modal
          open
          className="bh-group-grant-modal"
          contentClassName="bh-group-grant-content"
          title={t('entry.workspaceGrants')}
          closeLabel={t('approval.cancel')}
          onClose={() => {
            if (!busy) onClose();
          }}
        >
          <div className="bh-workspace-grants">
            {preview === undefined ? (
              <fieldset className="bh-group-grant-members" disabled={busy}>
                <legend>{t('groupGrant.select')}</legend>
                {members.map((bot) => (
                  <label key={bot.slug}>
                    <input
                      type="checkbox"
                      checked={eligible.includes(bot.slug)}
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? [...eligible, bot.slug]
                            : eligible.filter((slug) => slug !== bot.slug),
                        );
                        setPreview(undefined);
                        setResults([]);
                        setError(undefined);
                      }}
                    />
                    {bot.displayName}
                  </label>
                ))}
                {members.length === 0 ? <p>{t('groupGrant.noMembers')}</p> : null}
              </fieldset>
            ) : null}
            {error === undefined ? null : (
              <div className="bh-error" role="alert">
                {error}
              </div>
            )}
            {busy ? (
              <div className="bh-note" role="status">
                {t('grant.working')}
              </div>
            ) : null}
            {preview === undefined ? (
              <WorkspaceFolderPicker
                actions={actions}
                t={t}
                disabled={busy || eligible.length === 0}
                workspaces={workspaces}
                onChoose={choose}
              />
            ) : (
              <div role="group" aria-label={t('groupGrant.confirm')}>
                <SidebarCardList className="bh-workspace-folder-table bh-group-grant-results">
                  <FolderRow
                    name={preview.title}
                    path={preview.path}
                    initiallyExpanded
                    chips={
                      <Tag tone="outline">
                        {t('groupGrant.targets', { count: preview.members.length })}
                      </Tag>
                    }
                    pathAction={
                      <div className="bh-workspace-folder-path bh-group-grant-directory">
                        {preview.path}
                      </div>
                    }
                    detail={<p>{t('groupGrant.permissions')}</p>}
                  />
                  {preview.members.map((bot) => {
                    const result = results.find((row) => row.slug === bot.slug);
                    const status =
                      result?.status ?? (bot.grant === undefined ? 'pending' : 'existing');
                    return (
                      <SidebarCardRow
                        key={bot.slug}
                        title={bot.name}
                        state={status}
                        chips={
                          <>
                            <Tag
                              tone={
                                ['created', 'existing', 'confirmed'].includes(status)
                                  ? 'success'
                                  : 'outline'
                              }
                            >
                              <span role="status">{t(`groupGrant.${status}`)}</span>
                            </Tag>
                            <Tag tone="outline">
                              {t(
                                bot.grant?.orchestratorWrite
                                  ? 'grant.chip.write'
                                  : 'grant.chip.read',
                              )}
                            </Tag>
                          </>
                        }
                        meta={t('groupGrant.taskAccess', { mode: bot.access.mode })}
                        detail={
                          result?.error === undefined ? undefined : (
                            <div className="bh-error">{result.error}</div>
                          )
                        }
                      />
                    );
                  })}
                </SidebarCardList>
                <div className="bh-group-grant-actions">
                  {results.length === 0 || retry ? (
                    <Button variant="outline" disabled={busy} onClick={submit}>
                      {t(results.length === 0 ? 'grant.authorize' : 'groupGrant.retry')}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setPreview(undefined);
                      setResults([]);
                    }}
                  >
                    {t('approval.cancel')}
                  </Button>
                </div>
              </div>
            )}
            <details className="bh-group-grant-policy">
              <FolderSectionSummary>{t('groupGrant.details')}</FolderSectionSummary>
              <p>{t('groupGrant.unselected')}</p>
              <p>{t('groupGrant.scope')}</p>
              <p>{t('groupGrant.partial')}</p>
            </details>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function groupWorkspaceChip(
  facts: (WorkspaceGrantView[] | null | undefined)[],
  t: BotHarnessTranslate,
): string {
  if (facts.length === 0) return t('groupGrant.select');
  if (facts.some((grants) => grants === null)) return t('composerContext.unavailable');
  if (facts.some((grants) => grants === undefined)) return t('composerContext.loading');
  const ids = new Set(facts.flatMap((grants) => grants!.map((grant) => grant.workspaceId)));
  return t('composerContext.workspaces', { count: ids.size });
}
