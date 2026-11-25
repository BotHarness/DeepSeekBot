import { useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import { errorMessage } from './bridge.js';
import { Button } from './ds/button.js';
import { FieldStack, TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { StatusList, StatusListAction, StatusListRow, type StatusTone } from './ds/status-block.js';
import type { ConnectorsView } from './features/connectors/bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';

type Actions = Pick<
  BridgeActions,
  | 'connectors'
  | 'connectorKeySet'
  | 'connectorKeyClear'
  | 'connectorConnect'
  | 'connectorRefresh'
  | 'connectorAccountRemove'
>;

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
  const [connect, setConnect] = useState<{ service: string; label: string } | undefined>();
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

  const startConnect = async () => {
    if (connect === undefined || actions.connectorConnect === undefined) return;
    const label = connect.label.trim();
    await run(async () => {
      const linked = await actions.connectorConnect!(
        connect.service,
        label === '' ? undefined : label,
      );
      setLinks((current) => ({ ...current, [linked.account.accountId]: linked.url }));
      window.open(linked.url, '_blank', 'noopener,noreferrer');
      setConnect(undefined);
      setNotice(t('connectors.connect.opened'));
      setView(await actions.connectors!());
    });
  };

  const refresh = () =>
    run(async () => {
      setNotice(undefined);
      setView(await actions.connectorRefresh!());
    });

  const catalogName = (service: string) =>
    view.catalog.find((entry) => entry.service === service)?.name ?? service;

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
          view.configured && view.accounts.length > 0 ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>
              {t('connectors.accounts.refresh')}
            </Button>
          ) : undefined
        }
      >
        {view.configured ? (
          <StatusList data={{ 'data-connectors-accounts': '' }}>
            {[
              ...view.accounts.map((account) => (
                <StatusListRow
                  key={account.accountId}
                  icon="plug"
                  tone={TONE[account.status]}
                  title={
                    account.label === account.name
                      ? account.name
                      : `${account.name} · ${account.label}`
                  }
                  meta={[
                    connectorStatusLabel(account.status, t),
                    account.identity,
                    account.grants.length > 0
                      ? t('connectors.accounts.bots', { count: account.grants.length })
                      : undefined,
                  ]
                    .filter((part) => part !== undefined)
                    .join(' · ')}
                  data={{ 'data-connector-account': account.service }}
                  action={
                    <>
                      {account.status === 'pending' && links[account.accountId] !== undefined ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(links[account.accountId], '_blank', 'noopener,noreferrer')
                          }
                        >
                          {t('connectors.accounts.signIn')}
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setRemoving(account)}
                      >
                        {t('connectors.accounts.remove')}
                      </Button>
                    </>
                  }
                />
              )),
              <StatusListAction
                key="connect"
                label={t('connectors.accounts.connect')}
                data={{ 'data-connectors-connect-open': '' }}
                onClick={() => {
                  setError(undefined);
                  setConnect({ service: view.catalog[0]?.service ?? 'gmail', label: '' });
                }}
              />,
            ]}
          </StatusList>
        ) : (
          <Note inset>{t('connectors.accounts.empty')}</Note>
        )}
      </SettingsSection>
      {notice === undefined ? null : <Note>{notice}</Note>}
      {error === undefined || keyDraft !== undefined || connect !== undefined ? null : (
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
      {connect === undefined ? null : (
        <FormDialog
          title={t('connectors.connect.title')}
          labels={labels}
          submitLabel={t('connectors.connect.submit')}
          busy={busy}
          error={error}
          onCancel={() => setConnect(undefined)}
          onSubmit={() => void startConnect()}
        >
          <FieldStack>
            <SettingsRow
              title={t('connectors.connect.service')}
              control={
                <Select
                  label={t('connectors.connect.service')}
                  value={connect.service}
                  options={view.catalog.map((entry) => ({
                    value: entry.service,
                    label: entry.name,
                  }))}
                  onChange={(service) => setConnect({ ...connect, service })}
                />
              }
            />
            <TextField
              label={t('connectors.connect.label')}
              hint={t('connectors.connect.labelHint')}
              placeholder={catalogName(connect.service)}
              value={connect.label}
              onChange={(label) => setConnect({ ...connect, label })}
            />
          </FieldStack>
        </FormDialog>
      )}
      {!clearing ? null : (
        <ConfirmDialog
          title={t('connectors.key.removeTitle')}
          description={t('connectors.key.removeBody')}
          labels={labels}
          confirmLabel={t('connectors.key.remove')}
          danger
          busy={busy}
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
