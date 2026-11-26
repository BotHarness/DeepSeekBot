import { useState, type ReactElement } from 'react';

import { MaskedEmail } from './account-quota.js';
import type { BridgeActions } from './actions.js';
import { ConnectAppDialog } from './app-connections-catalog.js';
import { errorMessage } from './bridge.js';
import { Button } from './ds/button.js';
import { FieldStack, TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { StatusList, StatusListAction, StatusListRow, type StatusTone } from './ds/status-block.js';
import type { ConnectorAccess, ConnectorsView } from './features/connectors/bridge.js';
import { ConnectorLogo } from './features/connectors/logos.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';

type Actions = Pick<
  BridgeActions,
  | 'connectors'
  | 'connectorKeySet'
  | 'connectorKeyClear'
  | 'connectorConnect'
  | 'connectorReconnect'
  | 'connectorRefresh'
  | 'connectorSearch'
  | 'connectorLogos'
  | 'connectorMcpSearch'
  | 'connectorMcpAdd'
  | 'connectorGrantSet'
  | 'connectorAccountRemove'
>;

type Choice = ConnectorAccess | 'none';

type Account = ConnectorsView['accounts'][number];

const TONE: Record<Account['status'], StatusTone> = {
  active: 'success',
  pending: 'accent',
  expired: 'warning',
  failed: 'warning',
};

export function connectorStatusLabel(status: Account['status'], t: BotHarnessTranslate): string {
  return t(`connectors.status.${status}`);
}

export function ConnectorMeta({
  status,
  identity,
  extra,
  t,
}: {
  status: Account['status'];
  identity: string | undefined;
  extra?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <>
      {connectorStatusLabel(status, t)}
      {identity === undefined ? null : (
        <>
          {' · '}
          {identity.includes('@') ? <MaskedEmail email={identity} t={t} /> : identity}
        </>
      )}
      {extra === undefined ? null : ` · ${extra}`}
    </>
  );
}

export function ConnectorsSettings({
  actions,
  t,
}: {
  actions: Actions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<ConnectorsView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [keyDraft, setKeyDraft] = useState<string | undefined>();
  const [clearing, setClearing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [open, setOpen] = useState<string | undefined>();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Account | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const labels = { close: t('common.close'), cancel: t('common.cancel') };

  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    actions.connectors?.().then(
      (next) => {
        if (live) setView(next);
      },
      (failure: unknown) => {
        if (live) setError(errorMessage(failure));
      },
    );
    return () => {
      live = false;
    };
  }, [actions]);

  const run = async (work: () => Promise<void>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(undefined);
    try {
      await work();
      return true;
    } catch (failure) {
      setError(t('connectors.error', { message: errorMessage(failure) }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (view === undefined)
    return (
      <div ref={mount}>
        {error === undefined ? (
          <LoadingSkeleton kind="sidebar" label={t('botSettings.section.connectors')} />
        ) : (
          <Note tone="danger">{error}</Note>
        )}
      </div>
    );

  const saveKey = async () => {
    const key = keyDraft?.trim() ?? '';
    if (key === '' || actions.connectorKeySet === undefined) return;
    const done = await run(async () => setView(await actions.connectorKeySet!(key)));
    if (done) setKeyDraft(undefined);
  };

  const linked = (accountId: string, url: string | undefined) => {
    if (url === undefined) {
      setNotice(t('connectors.connect.connected'));
      return;
    }
    setLinks((current) => ({ ...current, [accountId]: url }));
    setNotice(t('connectors.connect.opened'));
  };

  const opened = (accountId: string, url: string | undefined) => {
    if (url !== undefined) window.open(url, '_blank', 'noopener,noreferrer');
    linked(accountId, url);
  };

  const reconnect = (accountId: string) =>
    run(async () => {
      const linked = await actions.connectorReconnect!(accountId);
      opened(accountId, linked.url);
      setView(await actions.connectors!());
    });

  const setAccess = (botSlug: string, accountId: string, choice: Choice) =>
    run(async () => {
      await actions.connectorGrantSet!(botSlug, accountId, choice === 'none' ? null : choice);
      setView(await actions.connectors!());
    });

  const accessOptions = [
    { value: 'none' as const, label: t('connectors.bot.none') },
    { value: 'read' as const, label: t('connectors.bot.read') },
    { value: 'write' as const, label: t('connectors.bot.write') },
  ];

  const refresh = () =>
    run(async () => {
      setNotice(undefined);
      setView(await actions.connectorRefresh!());
    });

  return (
    <div ref={mount} data-connectors-settings="">
      <SettingsSection title={t('connectors.key.section')}>
        <SettingsRow
          title={t('connectors.key.title')}
          info={{ label: t('connectors.key.title'), text: t('connectors.key.info') }}
          description={view.configured ? t('connectors.key.saved') : t('connectors.key.missing')}
          control={
            <Button
              variant={view.configured ? 'outline' : 'primary'}
              size="sm"
              disabled={busy}
              data-connectors-key-open=""
              onClick={() => {
                setError(undefined);
                setKeyDraft('');
              }}
            >
              {view.configured ? t('connectors.key.replace') : t('connectors.key.add')}
            </Button>
          }
        />
      </SettingsSection>
      <SettingsSection
        title={t('connectors.accounts.section')}
        action={
          view.accounts.length > 0 ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>
              {t('connectors.accounts.refresh')}
            </Button>
          ) : undefined
        }
      >
        <StatusList data={{ 'data-connectors-accounts': '' }}>
          {[
            ...view.accounts.map((account) => {
              const title =
                account.label === account.name
                  ? account.name
                  : `${account.name} · ${account.label}`;
              const signIn = links[account.accountId];
              const broken =
                account.status === 'expired' ||
                account.status === 'failed' ||
                (account.status === 'pending' && signIn === undefined);
              return (
                <StatusListRow
                  key={account.accountId}
                  leading={
                    <ConnectorLogo service={account.service} logos={actions.connectorLogos} />
                  }
                  tone={TONE[account.status]}
                  title={title}
                  meta={
                    <ConnectorMeta
                      status={account.status}
                      identity={account.identity}
                      extra={
                        account.grants.length > 0
                          ? t('connectors.accounts.bots', { count: account.grants.length })
                          : undefined
                      }
                      t={t}
                    />
                  }
                  data={{ 'data-connector-account': account.service }}
                  open={open === account.accountId}
                  onToggle={() =>
                    setOpen((current) =>
                      current === account.accountId ? undefined : account.accountId,
                    )
                  }
                  toggleLabel={t('connectors.accounts.details', { name: title })}
                  action={
                    account.status === 'pending' && signIn !== undefined ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(signIn, '_blank', 'noopener,noreferrer')}
                      >
                        {t('connectors.accounts.signIn')}
                      </Button>
                    ) : broken ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        data-connector-reconnect=""
                        onClick={() => void reconnect(account.accountId)}
                      >
                        {t('connectors.accounts.reconnect')}
                      </Button>
                    ) : undefined
                  }
                >
                  <SettingsSection title={t('connectors.accounts.botsTitle')}>
                    {account.grants.length === 0 ? (
                      <Note inset>{t('connectors.accounts.noBots')}</Note>
                    ) : (
                      account.grants.map((grant) => (
                        <SettingsRow
                          key={grant.botSlug}
                          title={grant.botName ?? grant.botSlug}
                          control={
                            <Select<Choice>
                              label={t('connectors.accounts.access', {
                                name: grant.botName ?? grant.botSlug,
                              })}
                              value={grant.access}
                              options={accessOptions}
                              disabled={busy}
                              onChange={(choice) =>
                                void setAccess(grant.botSlug, account.accountId, choice)
                              }
                            />
                          }
                        />
                      ))
                    )}
                  </SettingsSection>
                  <div data-connector-account-actions="">
                    {broken ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void reconnect(account.accountId)}
                      >
                        {t('connectors.accounts.reconnect')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setRemoving(account)}
                    >
                      {t('connectors.accounts.remove')}
                    </Button>
                  </div>
                </StatusListRow>
              );
            }),
            <StatusListAction
              key="connect"
              label={t('connectors.accounts.connect')}
              data={{ 'data-connectors-connect-open': '' }}
              onClick={() => {
                setError(undefined);
                setConnecting(true);
              }}
            />,
          ]}
        </StatusList>
      </SettingsSection>
      {notice === undefined ? null : <Note>{notice}</Note>}
      {error === undefined ||
      keyDraft !== undefined ||
      connecting ||
      clearing ||
      removing !== undefined ? null : (
        <Note tone="danger">{error}</Note>
      )}
      {keyDraft === undefined ? null : (
        <FormDialog
          title={t('connectors.key.dialogTitle')}
          labels={labels}
          submitLabel={t('connectors.key.save')}
          submitDisabled={keyDraft.trim() === ''}
          busy={busy}
          error={error}
          onCancel={() => setKeyDraft(undefined)}
          onSubmit={() => void saveKey()}
          secondary={
            view.configured ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setKeyDraft(undefined);
                  setClearing(true);
                }}
              >
                {t('connectors.key.remove')}
              </Button>
            ) : undefined
          }
        >
          <FieldStack>
            <TextField
              label={t('connectors.key.field')}
              hint={t('connectors.key.info')}
              placeholder="ak_…"
              type="password"
              autoComplete="off"
              monospace
              initialFocus
              value={keyDraft}
              onChange={setKeyDraft}
            />
          </FieldStack>
        </FormDialog>
      )}
      {!connecting ? null : (
        <ConnectAppDialog
          actions={actions}
          view={view}
          t={t}
          onClose={() => setConnecting(false)}
          onView={setView}
          onLinked={(accountId, url) => {
            setConnecting(false);
            linked(accountId, url);
            void actions.connectors?.().then(setView, () => undefined);
          }}
        />
      )}
      {!clearing ? null : (
        <ConfirmDialog
          title={t('connectors.key.removeTitle')}
          description={t('connectors.key.removeBody')}
          labels={labels}
          confirmLabel={t('connectors.key.remove')}
          danger
          busy={busy}
          error={error}
          onCancel={() => setClearing(false)}
          onConfirm={() =>
            void run(async () => {
              setView(await actions.connectorKeyClear!());
              setClearing(false);
            })
          }
        />
      )}
      {removing === undefined ? null : (
        <ConfirmDialog
          title={t('connectors.accounts.removeTitle', { name: removing.label })}
          description={t('connectors.accounts.removeBody')}
          labels={labels}
          confirmLabel={t('connectors.accounts.remove')}
          danger
          busy={busy}
          error={error}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() =>
            void run(async () => {
              await actions.connectorAccountRemove!(removing.accountId);
              setRemoving(undefined);
              setView(await actions.connectors!());
            })
          }
        />
      )}
    </div>
  );
}
