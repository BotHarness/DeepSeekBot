import { useState, type ReactElement } from 'react';

import { providerBrand } from '@botharness/host-client/shared/model-brand';
import type {
  ModelProviderRemoval,
  ModelProviderSave,
  ModelProviderView,
  ModelProvidersView,
} from '../../../core/src/models/providers.js';
import { bridgeHost, BridgeCallError, type BridgeCall } from './bridge.js';
import { Button } from './ds/button.js';
import { ConfirmDialog, FormDialog, DangerTextButton } from './ds/form-dialog.js';
import { Input } from './ds/input.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import { useSubscriptionEngines, type EngineId, type EngineStatusView } from './engine-choice.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { observeResource } from './messaging-defaults-live.js';
import { EngineBrandIcon, ModelBrandIcon } from './model-brand.js';
import { shortTime, engineName } from './session-engine.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

type Template = 'opencode-go' | 'deepseek' | 'custom';

interface Draft {
  name: string;
  key: string;
  endpoint: string;
  model: string;
  template: Template;
}

type Dialog =
  | { kind: 'add'; revision: number }
  | { kind: 'edit' | 'remove'; provider: ModelProviderView }
  | { kind: 'receipt'; receipt: ModelProviderSave };

const templateNames = { 'opencode-go': 'OpenCode Go', deepseek: 'DeepSeek' };
const engineIds: readonly EngineId[] = ['codex', 'claude'];

function blankDraft(): Draft {
  return { name: 'OpenCode Go', key: '', endpoint: '', model: '', template: 'opencode-go' };
}

function errorText(error: unknown, t: BotHarnessTranslate): string {
  switch (error instanceof BridgeCallError ? error.code : undefined) {
    case 'provider-conflict':
      return t('modelProviders.conflict');
    case 'provider-in-use':
      return t('modelProviders.inUse');
    case 'provider-read-only':
      return t('modelProviders.readOnly');
    case 'provider-inherited':
      return t('modelProviders.inherited');
    case 'permission-required':
      return t('modelProviders.forbidden');
    case 'provider-key-write-failed':
      return t('modelProviders.keyFailed');
    case 'invalid-input':
      return t('modelProviders.invalid');
    case undefined:
    default:
      return t('modelProviders.writeFailed');
  }
}

function providerSummary(provider: ModelProviderView, t: BotHarnessTranslate): string {
  const key =
    provider.keyLast4 === undefined
      ? t(provider.keyStored ? 'modelProviders.keyConfigured' : 'modelProviders.keyMissing')
      : `••••${provider.keyLast4}`;
  const status =
    provider.restingUntil === undefined
      ? t(
          provider.availability === 'available'
            ? 'modelProviders.available'
            : 'modelProviders.unavailable',
        )
      : t('modelProviders.resting', { time: shortTime(provider.restingUntil) });
  return [key, t('modelProviders.count', { count: provider.modelCount }), status].join(' · ');
}

function engineStatus(
  status: EngineStatusView | undefined,
  engine: string,
  t: BotHarnessTranslate,
): string {
  if (status?.available === true) return t('modelProviders.signedIn');
  switch (status?.reason) {
    case 'not-installed':
      return t('engine.notInstalled', { engine });
    case 'signed-out':
      return t('modelProviders.signedOut');
    case 'not-subscription':
      return t('engine.notSubscription');
    case 'host-not-local':
    case 'login-unknown':
    case undefined:
      return t('engine.loginUnknown');
  }
}

function Subscriptions({ t }: { t: BotHarnessTranslate }): ReactElement {
  const engines = useSubscriptionEngines(true, undefined, false);
  return (
    <SettingsSection title={t('modelProviders.subscriptions')}>
      <div ref={engines.mount}>
        <SidebarCardList label={t('modelProviders.subscriptions')}>
          {engineIds.map((id) => {
            const status = engines.view?.engines.find(({ engine }) => engine === id);
            const name = engineName(id);
            return (
              <SidebarCardRow
                key={id}
                leading={<EngineBrandIcon brand={id === 'codex' ? 'openai' : 'claude'} size={20} />}
                title={name}
                summary={engineStatus(status, name, t)}
                trailing={
                  status?.installed === true && !status.available ? (
                    <Button
                      variant="outline"
                      disabled={engines.signingIn !== undefined}
                      onClick={() => engines.signIn(id)}
                    >
                      {engines.signingIn === id
                        ? t('engine.signingIn')
                        : t('engine.signInLabel', { engine: name })}
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </SidebarCardList>
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
      </div>
    </SettingsSection>
  );
}

export function ModelProvidersSettings({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<ModelProvidersView>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [dialog, setDialog] = useState<Dialog>();
  const [draft, setDraft] = useState(blankDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [refresh, setRefresh] = useState(0);

  const mount = useMountedResource<HTMLElement>(() => {
    const request = new AbortController();
    const load = async () => {
      try {
        const result = await bridgeHost(call, request.signal).call<ModelProvidersView>(
          'modelProviders',
        );
        if (request.signal.aborted) return;
        setView(result);
        setLoadFailed(false);
      } catch {
        if (request.signal.aborted) return;
        setView(undefined);
        setLoadFailed(true);
      }
    };
    void load();
    const stop = observeResource('model-providers', load);
    return () => {
      request.abort();
      stop();
    };
  }, [call, refresh]);

  const reload = () => setRefresh((value) => value + 1);
  const close = () => {
    setDialog(undefined);
    setDraft(blankDraft());
    setError(undefined);
  };
  const labels = { cancel: t('common.cancel'), close: t('common.close') };
  const field = (name: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [name]: value }));
  const run = async (method: string, payload: Record<string, unknown>, showReceipt: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await bridgeHost(call).call<ModelProviderSave | ModelProviderRemoval>(
        method,
        payload,
      );
      close();
      if (showReceipt && 'testReply' in result) setDialog({ kind: 'receipt', receipt: result });
      else if (result.credentialCleanupPending) setNotice(t('modelProviders.cleanupPending'));
      reload();
    } catch (cause: unknown) {
      setError(errorText(cause, t));
      if (cause instanceof BridgeCallError && cause.code === 'provider-conflict') reload();
    } finally {
      setBusy(false);
    }
  };

  const editor = (() => {
    if (dialog === undefined) return null;
    if (dialog.kind === 'receipt') {
      const { receipt } = dialog;
      return (
        <FormDialog
          title={t('modelProviders.saved')}
          labels={{ ...labels, cancel: labels.close }}
          submitLabel={labels.close}
          onCancel={close}
        >
          <Note tone={receipt.keyStored ? 'success' : 'muted'}>
            {t(receipt.keyStored ? 'modelProviders.keyStored' : 'modelProviders.keyMissing')}
          </Note>
          <Note tone={receipt.modelCount > 0 ? 'success' : 'warning'}>
            {t(receipt.modelCount > 0 ? 'modelProviders.modelsListed' : 'modelProviders.noModels', {
              count: receipt.modelCount,
            })}
          </Note>
          <Note
            tone={
              receipt.testReply === 'ok'
                ? 'success'
                : receipt.testReply === 'failed'
                  ? 'warning'
                  : 'muted'
            }
          >
            {t(
              receipt.testReply === 'ok'
                ? 'modelProviders.replyOk'
                : receipt.testReply === 'failed'
                  ? 'modelProviders.replyFailed'
                  : 'modelProviders.replySkipped',
            )}
          </Note>
          {receipt.credentialCleanupPending ? (
            <Note tone="warning">{t('modelProviders.cleanupPending')}</Note>
          ) : null}
        </FormDialog>
      );
    }
    if (dialog.kind === 'remove') {
      const { id, name, revision } = dialog.provider;
      return (
        <ConfirmDialog
          title={t('modelProviders.removeTitle', { name })}
          description={t('modelProviders.removeWarning')}
          labels={labels}
          confirmLabel={t('modelProviders.remove')}
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={() =>
            void run('modelProviderRemove', { id, expectedRevision: revision }, false)
          }
        />
      );
    }

    const adding = dialog.kind === 'add';
    const provider = adding ? undefined : dialog.provider;
    const custom = adding && draft.template === 'custom';
    const canRename = adding || provider?.canRename === true;
    const canReplace = adding || provider?.canReplaceKey === true;
    const name = draft.name.trim();
    const hasKey = draft.key.trim() !== '';
    const nameChanged = canRename && name !== provider?.name;
    return (
      <FormDialog
        title={
          adding
            ? t('modelProviders.add')
            : t('modelProviders.editTitle', { name: provider?.name ?? '' })
        }
        size="medium"
        labels={labels}
        submitLabel={t('modelProviders.save')}
        busy={busy}
        submitDisabled={
          adding
            ? !name || !hasKey || (custom && (!draft.endpoint.trim() || !draft.model.trim()))
            : (!nameChanged && !hasKey) || (nameChanged && !name)
        }
        error={error}
        onCancel={close}
        onSubmit={() => {
          if (dialog.kind === 'add') {
            void run(
              'modelProviderAdd',
              {
                template: draft.template,
                name,
                key: draft.key,
                expectedRevision: dialog.revision,
                ...(custom ? { endpoint: draft.endpoint.trim(), model: draft.model.trim() } : {}),
              },
              true,
            );
          } else {
            const { id, revision } = dialog.provider;
            void run(
              'modelProviderEdit',
              {
                id,
                expectedRevision: revision,
                ...(nameChanged ? { name } : {}),
                ...(hasKey ? { key: draft.key } : {}),
              },
              hasKey,
            );
          }
        }}
        secondary={
          provider?.canRemove === true ? (
            <DangerTextButton
              disabled={busy}
              onClick={() => {
                setError(undefined);
                setDraft(blankDraft());
                setDialog({ kind: 'remove', provider });
              }}
            >
              {t('modelProviders.remove')}
            </DangerTextButton>
          ) : undefined
        }
      >
        <SettingsRows>
          {adding ? (
            <SettingsRow
              title={t('modelProviders.template')}
              control={
                <Select<Template>
                  label={t('modelProviders.template')}
                  value={draft.template}
                  disabled={busy}
                  options={[
                    { value: 'opencode-go', label: templateNames['opencode-go'] },
                    { value: 'deepseek', label: templateNames.deepseek },
                    { value: 'custom', label: t('modelProviders.custom') },
                  ]}
                  onChange={(template) =>
                    setDraft((previous) => ({
                      ...previous,
                      template,
                      name: template === 'custom' ? '' : templateNames[template],
                    }))
                  }
                />
              }
            />
          ) : null}
          {canRename ? (
            <SettingsRow
              title={t('modelProviders.name')}
              control={
                <Input
                  aria-label={t('modelProviders.name')}
                  value={draft.name}
                  maxLength={100}
                  disabled={busy}
                  onChange={(event) => field('name', event.target.value)}
                />
              }
            />
          ) : null}
          {custom ? (
            <>
              <SettingsRow
                title={t('modelProviders.endpoint')}
                control={
                  <Input
                    type="url"
                    aria-label={t('modelProviders.endpoint')}
                    value={draft.endpoint}
                    disabled={busy}
                    onChange={(event) => field('endpoint', event.target.value)}
                  />
                }
              />
              <SettingsRow
                title={t('modelProviders.model')}
                control={
                  <Input
                    aria-label={t('modelProviders.model')}
                    value={draft.model}
                    disabled={busy}
                    onChange={(event) => field('model', event.target.value)}
                  />
                }
              />
            </>
          ) : null}
          {canReplace ? (
            <SettingsRow
              title={t('modelProviders.apiKey')}
              control={
                <Input
                  type="password"
                  autoComplete="off"
                  aria-label={t('modelProviders.apiKey')}
                  placeholder={adding ? undefined : t('modelProviders.replacePlaceholder')}
                  value={draft.key}
                  maxLength={8192}
                  disabled={busy}
                  onChange={(event) => field('key', event.target.value)}
                />
              }
            />
          ) : null}
        </SettingsRows>
      </FormDialog>
    );
  })();

  return (
    <>
      <SettingsSection
        rootRef={mount}
        title={t('modelProviders.apiKey')}
        action={
          view?.revision === undefined ? undefined : (
            <Button
              variant="primary"
              onClick={() => {
                if (view.revision === undefined) return;
                setDraft(blankDraft());
                setDialog({ kind: 'add', revision: view.revision });
              }}
            >
              {t('modelProviders.add')}
            </Button>
          )
        }
      >
        {loadFailed ? (
          <ReadFailure retryLabel={t('engine.reload')} onRetry={reload}>
            {t('modelProviders.readFailed')}
          </ReadFailure>
        ) : view === undefined ? (
          <Note>{t('modelProviders.loading')}</Note>
        ) : view.providers.length === 0 ? (
          <Note>{t('modelProviders.empty')}</Note>
        ) : (
          <SidebarCardList label={t('modelProviders.apiKey')}>
            {view.providers.map((provider) => (
              <SidebarCardRow
                key={provider.id}
                leading={
                  <ModelBrandIcon brand={providerBrand(provider.id, provider.name)} size={20} />
                }
                title={provider.name}
                summary={providerSummary(provider, t)}
                trailing={
                  provider.canRename || provider.canReplaceKey ? (
                    <Button
                      variant="outline"
                      aria-label={t('modelProviders.editTitle', { name: provider.name })}
                      onClick={() => {
                        setDraft({ ...blankDraft(), name: provider.name });
                        setDialog({ kind: 'edit', provider });
                      }}
                    >
                      {t('modelProviders.edit')}
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </SidebarCardList>
        )}
        {notice === undefined ? null : <Note tone="warning">{notice}</Note>}
      </SettingsSection>
      <Subscriptions t={t} />
      {editor}
    </>
  );
}
