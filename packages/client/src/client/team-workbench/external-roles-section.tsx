import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { listBots } from '@botharness/host-client/bots';
import {
  changeExternalRole,
  readExternalRoles,
  type HostExternalRole,
  type HostExternalRoleChange,
} from '@botharness/host-client/external-roles';
import { bridgeHost, type BridgeCall } from '../bridge.js';
import { Button } from '../ds/button.js';
import { PanelEmptyState } from '../ds/empty-state.js';
import { Icon } from '../ds/icon.js';
import { IconButton } from '../ds/icon-button.js';
import { NavItem } from '../ds/nav-item.js';
import { Note } from '../ds/note.js';
import { Tag } from '../ds/tag.js';
import { space } from '../ds/tobs.stylex.js';
import { Tooltip } from '../ds/tooltip.js';
import type { BotHarnessTranslate } from '../locale.js';
import { useMountedResource } from '../mounted-resource.js';
import { ExternalRoleDialog, type ExternalRoleDraft } from './external-role-dialog.js';
import {
  STALE_EXTERNAL_ROLE,
  externalRoleErrorText,
  refusalCode,
  scopeSummary,
} from './external-role-model.js';
import { EXTERNAL_ROLE_TABS, type ExternalRoleTabId } from './external-role-tabs.js';
import { DetailColumn, EmptyDetail, ListColumn, PanelGap } from './frame.js';

const styles = stylex.create({
  contents: { display: 'contents' },
  notice: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space.x2 },
});

export interface BotEntry {
  readonly slug: string;
  readonly name: string;
}

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; role: HostExternalRole; stale?: boolean | undefined };

export function ExternalRolesSection({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [roles, setRoles] = useState<readonly HostExternalRole[]>([]);
  const [bots, setBots] = useState<readonly BotEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ExternalRoleTabId>('bots');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [dialog, setDialog] = useState<Dialog>();
  const [dialogError, setDialogError] = useState<string>();

  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const host = bridgeHost(call, signal);
    void Promise.all([readExternalRoles(host), listBots(host)])
      .then(([roleList, botList]) => {
        if (signal.aborted) return;
        setRoles(roleList);
        setBots(
          botList.map((bot) => ({
            slug: bot.slug,
            name: bot.tob?.defaultName === true ? t('tob.defaultName') : bot.displayName,
          })),
        );
        setFailed(false);
        setReady(true);
      })
      .catch(() => {
        if (!signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [call, t, attempt]);

  const names = new Map(bots.map((bot) => [bot.slug, bot.name]));
  const botName = (slug: string): string => names.get(slug) ?? slug;
  const needle = query.trim().toLocaleLowerCase();
  const shown = roles.filter(
    (item) => needle === '' || item.name.toLocaleLowerCase().includes(needle),
  );
  const role = shown.find((item) => item.id === selected) ?? shown[0];

  const reload = async (): Promise<void> => {
    setBusy(true);
    try {
      setRoles(await readExternalRoles(bridgeHost(call)));
      setStale(false);
      setError(undefined);
    } catch (failure) {
      setError(externalRoleErrorText(t, failure));
    }
    setBusy(false);
  };

  const change = async (input: HostExternalRoleChange): Promise<HostExternalRole | undefined> => {
    setBusy(true);
    setError(undefined);
    setStale(false);
    try {
      const saved = await changeExternalRole(bridgeHost(call), input);
      setRoles((current) =>
        current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      );
      return saved;
    } catch (failure) {
      if (refusalCode(failure) === STALE_EXTERNAL_ROLE) setStale(true);
      else setError(externalRoleErrorText(t, failure));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const update = (
    target: HostExternalRole,
    patch: Omit<
      Extract<HostExternalRoleChange, { kind: 'update' }>,
      'kind' | 'id' | 'expectedRevision'
    >,
  ): Promise<HostExternalRole | undefined> =>
    change({ kind: 'update', id: target.id, expectedRevision: target.revision, ...patch });

  const submitDialog = async (draft: ExternalRoleDraft): Promise<void> => {
    if (dialog === undefined) return;
    setDialogError(undefined);
    setBusy(true);
    try {
      const saved = await changeExternalRole(
        bridgeHost(call),
        dialog.kind === 'create'
          ? { kind: 'create', name: draft.name, botScope: draft.botScope }
          : {
              kind: 'update',
              id: dialog.role.id,
              expectedRevision: dialog.role.revision,
              name: draft.name,
            },
      );
      setRoles((current) =>
        current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      );
      setQuery('');
      setSelected(saved.id);
      setDialog(undefined);
    } catch (failure) {
      if (refusalCode(failure) === STALE_EXTERNAL_ROLE && dialog.kind === 'rename')
        await reloadDialog(dialog.role);
      else setDialogError(externalRoleErrorText(t, failure));
    } finally {
      setBusy(false);
    }
  };

  const reloadDialog = async (target: HostExternalRole): Promise<void> => {
    const latest = await readExternalRoles(bridgeHost(call)).catch(() => undefined);
    const fresh = latest?.find((item) => item.id === target.id);
    if (latest !== undefined) setRoles(latest);
    setDialog(
      fresh === undefined
        ? { kind: 'rename', role: target, stale: true }
        : { kind: 'rename', role: fresh },
    );
    setDialogError(
      t(
        fresh === undefined
          ? 'team.externalRoles.error.reloadFailed'
          : 'team.externalRoles.error.reloaded',
      ),
    );
  };

  const retryDialogReload = async (): Promise<void> => {
    if (dialog?.kind !== 'rename') return;
    setBusy(true);
    await reloadDialog(dialog.role);
    setBusy(false);
  };

  const retry = (): void => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  const notice = stale ? (
    <Note tone="warning">
      <span {...stylex.props(styles.notice)} data-external-role-conflict="">
        <span>{t('team.externalRoles.error.stale')}</span>
        {error === undefined ? null : <span data-external-role-reload-error="">{error}</span>}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          data-external-role-reload=""
          onClick={() => void reload()}
        >
          {t('team.roles.reload')}
        </Button>
      </span>
    </Note>
  ) : error === undefined ? null : (
    <Note tone="danger">{error}</Note>
  );

  return (
    <div ref={mount} {...stylex.props(styles.contents)} data-panel-columns="">
      <ListColumn
        title={t('team.externalRoles.title')}
        count={ready ? roles.length : undefined}
        action={
          <Tooltip label={t('team.externalRoles.new')}>
            <IconButton
              aria-label={t('team.externalRoles.new')}
              disabled={!ready || busy}
              data-external-role-new=""
              onClick={() => {
                setDialogError(undefined);
                setDialog({ kind: 'create' });
              }}
            >
              <Icon name="plus" />
            </IconButton>
          </Tooltip>
        }
        search={{ label: t('team.externalRoles.search'), value: query, onChange: setQuery }}
        status={
          failed ? (
            <Note tone="danger">
              {t('team.error.load')}
              <Button size="sm" variant="outline" data-external-roles-retry="" onClick={retry}>
                {t('team.workbench.retry')}
              </Button>
            </Note>
          ) : !ready ? (
            <PanelEmptyState icon="globe">{t('team.workbench.loading')}</PanelEmptyState>
          ) : roles.length === 0 ? (
            <PanelEmptyState icon="globe">{t('team.externalRoles.empty')}</PanelEmptyState>
          ) : shown.length === 0 ? (
            <Note>{t('team.workbench.noMatch')}</Note>
          ) : undefined
        }
      >
        {shown.map((item) => (
          <li key={item.id}>
            <NavItem
              icon={<Icon name="globe" />}
              label={item.name}
              description={scopeSummary(t, item.botScope, botName)}
              multiline
              current={item.id === role?.id}
              data={{ 'data-external-role': item.id }}
              onSelect={() => {
                setSelected(item.id);
                setStale(false);
                setError(undefined);
              }}
            />
          </li>
        ))}
      </ListColumn>
      <PanelGap />
      {role === undefined ? (
        <EmptyDetail icon="globe">
          {ready && roles.length === 0
            ? t('team.externalRoles.emptyDetail')
            : t('team.externalRoles.pick')}
        </EmptyDetail>
      ) : (
        <DetailColumn<ExternalRoleTabId>
          icon={<Icon name="globe" />}
          title={role.name}
          meta={
            <Tag tone="quiet">
              {role.botScope.kind === 'all'
                ? t('team.externalRoles.scope.allShort')
                : t('team.externalRoles.scope.count', { count: role.botScope.botSlugs.length })}
            </Tag>
          }
          action={
            <Tooltip label={t('team.externalRoles.rename')}>
              <IconButton
                aria-label={t('team.externalRoles.rename')}
                disabled={busy}
                data-external-role-rename=""
                onClick={() => {
                  setDialogError(undefined);
                  setDialog({ kind: 'rename', role });
                }}
              >
                <Icon name="pencil" />
              </IconButton>
            </Tooltip>
          }
          tabs={EXTERNAL_ROLE_TABS.map((item) => ({
            id: item.id,
            label: t(item.label),
            render: () => (
              <>
                {notice}
                {item.render({ call, t, role, bots, botName, busy, update })}
              </>
            ),
          }))}
          tab={tab}
          onTab={setTab}
          data={{ 'data-external-role-detail': role.id }}
        />
      )}
      {dialog === undefined ? null : (
        <ExternalRoleDialog
          t={t}
          role={dialog.kind === 'rename' ? dialog.role : undefined}
          bots={bots}
          busy={busy}
          error={dialogError}
          onReload={
            dialog.kind === 'rename' && dialog.stale === true
              ? () => void retryDialogReload()
              : undefined
          }
          onCancel={() => setDialog(undefined)}
          onSubmit={(draft) => void submitDialog(draft)}
        />
      )}
    </div>
  );
}
