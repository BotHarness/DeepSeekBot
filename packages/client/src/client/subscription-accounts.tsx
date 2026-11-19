import { useMemo, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { bridgeHost, BridgeCallError, type BridgeCall } from './bridge.js';
import { Button } from './ds/button.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Input } from './ds/input.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import {
  engineApi,
  engineModelKey,
  parseEngines,
  useSubscriptionEngines,
  type EngineStatusView,
} from './engine-choice.js';
import type { BotHarnessTranslate } from './locale.js';
import { EngineBrandIcon } from './model-brand.js';
import { engineName } from './session-engine.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

const styles = stylex.create({
  actions: { display: 'flex', justifyContent: 'end', flexWrap: 'wrap', gap: space.x2 },
});

type AccountDialog =
  | { kind: 'add'; revision: number }
  | { kind: 'rename' | 'remove'; revision: number; id: string; name: string };

function signInStatus(status: EngineStatusView, label: string, t: BotHarnessTranslate): string {
  if (status.available) return t('modelProviders.signedIn');
  switch (status.reason) {
    case 'not-installed':
      return t('engine.notInstalled', { engine: label });
    case 'signed-out':
      return t('modelProviders.signedOut');
    case 'not-subscription':
      return t('engine.notSubscription');
    case 'host-not-local':
    case 'login-unknown':
      return t('engine.loginUnknown');
  }
}

function accountError(error: unknown, t: BotHarnessTranslate): string {
  if (error instanceof BridgeCallError) {
    switch (error.code) {
      case 'engine-account-conflict':
        return t('modelProviders.accountConflict');
      case 'engine-account-in-use':
        return t('modelProviders.accountInUse', { references: error.message });
      case 'engine-account-busy':
        return t('modelProviders.accountBusy');
      case 'permission-required':
        return t('modelProviders.forbidden');
    }
  }
  return t('modelProviders.accountWriteFailed');
}

export function SubscriptionAccounts({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const api = useMemo(
    () => ({
      ...engineApi,
      async read() {
        return parseEngines(await bridgeHost(call).call('engineAccounts', {}));
      },
      login: (engine: EngineStatusView['engine'], accountId?: string) =>
        bridgeHost(call).call<{ url?: string }>('engineAccountLogin', { id: accountId ?? engine }),
    }),
    [call],
  );
  const engines = useSubscriptionEngines(true, api, false, true);
  const [dialog, setDialog] = useState<AccountDialog>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const revision = engines.view?.revision;
  const labels = { cancel: t('common.cancel'), close: t('common.close') };

  const open = (next: AccountDialog) => {
    setError(undefined);
    setName(next.kind === 'add' ? '' : next.name);
    setDialog(next);
  };

  const save = async (current: AccountDialog) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const expectedRevision = current.revision;
    try {
      const host = bridgeHost(call);
      if (current.kind === 'add')
        await host.call('engineAccountAdd', {
          engine: 'codex',
          name: name.trim(),
          expectedRevision,
        });
      else if (current.kind === 'rename')
        await host.call('engineAccountRename', {
          id: current.id,
          name: name.trim(),
          expectedRevision,
        });
      else {
        const removed = await host.call<{ homeCleanupPending?: true }>('engineAccountRemove', {
          id: current.id,
          expectedRevision,
          confirm: true,
        });
        if (removed.homeCleanupPending) setNotice(t('modelProviders.accountCleanupPending'));
      }
      setDialog(undefined);
      await engines.refresh();
    } catch (cause) {
      setError(accountError(cause, t));
      if (cause instanceof BridgeCallError && cause.code === 'engine-account-conflict')
        await engines.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title={t('modelProviders.subscriptions')}
      action={
        revision === undefined ? undefined : (
          <Button variant="primary" onClick={() => open({ kind: 'add', revision })}>
            {t('modelProviders.addAccount')}
          </Button>
        )
      }
    >
      <div ref={engines.mount}>
        {engines.loadFailed ? (
          <ReadFailure retryLabel={t('engine.reload')} onRetry={() => void engines.refresh()}>
            {t('engine.loadFailed')}
          </ReadFailure>
        ) : engines.view === undefined ? (
          <Note>{t('modelProviders.loadingAccounts')}</Note>
        ) : engines.view.engines.length === 0 ? (
          <Note>{t('engine.localOnly')}</Note>
        ) : (
          <SidebarCardList label={t('modelProviders.subscriptions')}>
            {engines.view.engines.map((status) => {
              const { engine, accountId } = status;
              const brand = engineName(engine);
              const title =
                status.accountName === undefined ? brand : `${brand} · ${status.accountName}`;
              const key = engineModelKey(engine, accountId);
              const canManage =
                accountId !== undefined && engine === 'codex' && revision !== undefined;
              const canSignIn = status.installed && !status.available;
              return (
                <SidebarCardRow
                  key={key}
                  leading={
                    <EngineBrandIcon brand={engine === 'codex' ? 'openai' : 'claude'} size={20} />
                  }
                  title={title}
                  summary={signInStatus(status, brand, t)}
                  trailing={
                    canManage || canSignIn ? (
                      <div {...stylex.props(styles.actions)}>
                        {canSignIn ? (
                          <Button
                            variant="outline"
                            disabled={engines.signingIn !== undefined}
                            onClick={() => engines.signIn(engine, accountId)}
                          >
                            {engines.signingIn === key
                              ? t('engine.signingIn')
                              : t('engine.signInLabel', { engine: title })}
                          </Button>
                        ) : null}
                        {canManage ? (
                          <>
                            <Button
                              variant="outline"
                              aria-label={t('modelProviders.renameAccountTitle', { name: title })}
                              onClick={() =>
                                open({ kind: 'rename', id: accountId, name: title, revision })
                              }
                            >
                              {t('modelProviders.renameAccount')}
                            </Button>
                            <Button
                              variant="outline"
                              aria-label={t('modelProviders.removeTitle', { name: title })}
                              onClick={() =>
                                open({ kind: 'remove', id: accountId, name: title, revision })
                              }
                            >
                              {t('modelProviders.remove')}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
          </SidebarCardList>
        )}
        {engines.signInUrl === undefined ? null : (
          <Note>
            <a href={engines.signInUrl} target="_blank" rel="noopener noreferrer">
              {t('engine.openSignIn')}
            </a>
          </Note>
        )}
        {engines.error === undefined ? null : (
          <Note tone="danger">{t('modelProviders.signInFailed')}</Note>
        )}
        {notice === undefined ? null : <Note tone="warning">{notice}</Note>}
      </div>
      {dialog === undefined ? null : dialog.kind === 'remove' ? (
        <ConfirmDialog
          title={t('modelProviders.removeTitle', { name: dialog.name })}
          description={t('modelProviders.removeAccountWarning')}
          labels={labels}
          confirmLabel={t('modelProviders.remove')}
          busy={busy}
          error={error}
          onCancel={() => setDialog(undefined)}
          onConfirm={() => void save(dialog)}
        />
      ) : (
        <FormDialog
          title={
            dialog.kind === 'add'
              ? t('modelProviders.addAccount')
              : t('modelProviders.renameAccountTitle', { name: dialog.name })
          }
          labels={labels}
          submitLabel={t('modelProviders.save')}
          busy={busy}
          error={error}
          submitDisabled={
            name.trim() === '' || (dialog.kind === 'rename' && name.trim() === dialog.name)
          }
          onCancel={() => setDialog(undefined)}
          onSubmit={() => void save(dialog)}
        >
          <SettingsRows>
            {dialog.kind === 'add' ? (
              <SettingsRow
                title={t('modelProviders.accountEngine')}
                control={
                  <Select
                    label={t('modelProviders.accountEngine')}
                    value="codex"
                    options={[{ value: 'codex', label: engineName('codex') }]}
                    onChange={() => undefined}
                    disabled={busy}
                  />
                }
              />
            ) : null}
            <SettingsRow
              title={t('modelProviders.name')}
              control={
                <Input
                  aria-label={t('modelProviders.name')}
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              }
            />
          </SettingsRows>
        </FormDialog>
      )}
    </SettingsSection>
  );
}
