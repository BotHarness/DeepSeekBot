import {
  engineModelKey,
  type EngineStatusView,
  type useSubscriptionEngines,
} from './engine-choice.js';
import { EngineBrandIcon } from './model-brand.js';
import { SubscriptionAccounts } from './subscription-accounts.js';
import { useState, type ReactElement } from 'react';

import { providerBrand } from '@botharness/host-client/shared/model-brand';
import type {
  ModelProviderRemoval,
  ModelProviderSave,
  ModelProviderView,
  ModelProvidersView,
} from '@botharness/host-client/model-providers';
import { bridgeHost, BridgeCallError, type BridgeCall } from './bridge.js';
import { Button } from './ds/button.js';
import { ConfirmDialog, FormDialog, DangerTextButton } from './ds/form-dialog.js';
import { Input } from './ds/input.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { Select } from './ds/select.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { observeResource } from './messaging-defaults-live.js';
import { ModelBrandIcon } from './model-brand.js';
import { engineAccountTitle, engineName, shortTime } from './session-engine.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { roleLabel } from './team-roles.js';
import { canManage, loadRoles, roleAllowsProvider, type TeamRole } from './team-roles-bridge.js';
import { canManageModelProviders } from './team-bridge.js';
import { useTeamMode } from './team-state.js';

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

export function ModelProviderSubscriptions({
  engines,
  t,
}: {
  engines: ReturnType<typeof useSubscriptionEngines>;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <>
      {engines.loadFailed ? (
        <ReadFailure retryLabel={t('engine.reload')} onRetry={() => void engines.refresh()}>
          {t('engine.loadFailed')}
        </ReadFailure>
      ) : null}
      <SidebarCardList label={t('modelProviders.subscriptions')}>
        {(engines.view?.engines ?? []).map((status) => {
          const { engine: id, accountId, accountName } = status;
          const brand = engineName(id);
          const name = engineAccountTitle(id, accountName);
          const key = engineModelKey(id, accountId);
          return (
            <SidebarCardRow
              key={key}
              leading={<EngineBrandIcon brand={id === 'codex' ? 'openai' : 'claude'} size={20} />}
              title={name}
              summary={engineStatus(status, brand, t)}
              trailing={
                status?.installed === true &&
                !status.available &&
                status.reason !== 'host-not-local' ? (
                  <Button
                    variant="outline"
                    disabled={engines.signingIn !== undefined}
                    aria-label={
                      engines.signingIn === key
                        ? undefined
                        : t('engine.signInLabel', { engine: name })
                    }
                    onClick={() => engines.signIn(id, accountId)}
                  >
                    {engines.signingIn === key ? t('engine.signingIn') : t('modelProviders.signIn')}
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
    </>
  );
}

function ProviderKeyField({
  value,
  busy,
  replace = false,
  onChange,
  t,
}: {
  value: string;
  busy: boolean;
  replace?: boolean;
  onChange(value: string): void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <SettingsRow
      title={t('modelProviders.apiKey')}
      control={
        <Input
          type="password"
          autoComplete="off"
          required={!replace}
          aria-label={t('modelProviders.apiKey')}
          placeholder={replace ? t('modelProviders.replacePlaceholder') : undefined}
          value={value}
          maxLength={8192}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
        />
      }
    />
  );
}

function SavedModelProvider({
  receipt,
  onClose,
  inline = false,
  t,
}: {
  receipt: ModelProviderSave;
  onClose(): void;
  inline?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const labels = { cancel: t('common.close'), close: t('common.close') };
  return (
    <FormDialog
      inline={inline}
      title={t('modelProviders.saved')}
      labels={labels}
      submitLabel={labels.close}
      onCancel={onClose}
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

export function AddModelProvider({
  call,
  revision,
  onAdded,
  onClose,
  onConflict,
  onSavingChange,
  inline = false,
  t,
}: {
  call: BridgeCall;
  revision: number | undefined;
  onAdded(receipt: ModelProviderSave): void;
  onClose(): void;
  onConflict?(): void;
  onSavingChange?(saving: boolean): void;
  inline?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const [draft, setDraft] = useState(blankDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<ModelProviderSave>();
  const name = draft.name.trim();
  const endpoint = draft.endpoint.trim();
  const model = draft.model.trim();
  const custom = draft.template === 'custom';
  const changeDraft = (patch: Partial<Draft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setError(undefined);
  };
  const save = async () => {
    if (busy || revision === undefined) return;
    setBusy(true);
    onSavingChange?.(true);
    setError(undefined);
    try {
      const result = await bridgeHost(call).call<ModelProviderSave>('modelProviderAdd', {
        template: draft.template,
        name,
        key: draft.key,
        expectedRevision: revision,
        ...(custom ? { endpoint, model } : {}),
      });
      setDraft(blankDraft());
      setReceipt(result);
    } catch (cause) {
      setError(errorText(cause, t));
      if (cause instanceof BridgeCallError && cause.code === 'provider-conflict') onConflict?.();
    } finally {
      setBusy(false);
      onSavingChange?.(false);
    }
  };
  if (receipt !== undefined)
    return (
      <SavedModelProvider
        receipt={receipt}
        inline={inline}
        onClose={() => onAdded(receipt)}
        t={t}
      />
    );
  return (
    <FormDialog
      inline={inline}
      title={t('modelProviders.add')}
      size="medium"
      labels={{ cancel: t('common.cancel'), close: t('common.close') }}
      submitLabel={t('modelProviders.save')}
      busy={busy}
      submitDisabled={
        revision === undefined || !name || !draft.key.trim() || (custom && (!endpoint || !model))
      }
      error={error}
      onCancel={onClose}
      onClose={() => {
        if (!busy) onClose();
      }}
      onSubmit={() => void save()}
    >
      <SettingsRows>
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
                changeDraft({
                  template,
                  name: template === 'custom' ? '' : templateNames[template],
                })
              }
            />
          }
        />
        <SettingsRow
          title={t('modelProviders.name')}
          control={
            <Input
              aria-label={t('modelProviders.name')}
              required
              value={draft.name}
              maxLength={100}
              disabled={busy}
              onChange={(event) => changeDraft({ name: event.target.value })}
            />
          }
        />
        {custom ? (
          <>
            <SettingsRow
              title={t('modelProviders.endpoint')}
              control={
                <Input
                  type="url"
                  aria-label={t('modelProviders.endpoint')}
                  required
                  value={draft.endpoint}
                  disabled={busy}
                  onChange={(event) => changeDraft({ endpoint: event.target.value })}
                />
              }
            />
            <SettingsRow
              title={t('modelProviders.model')}
              control={
                <Input
                  aria-label={t('modelProviders.model')}
                  required
                  value={draft.model}
                  disabled={busy}
                  onChange={(event) => changeDraft({ model: event.target.value })}
                />
              }
            />
          </>
        ) : null}
        <ProviderKeyField
          value={draft.key}
          busy={busy}
          onChange={(key) => changeDraft({ key })}
          t={t}
        />
      </SettingsRows>
    </FormDialog>
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
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [dialog, setDialog] = useState<Dialog>();
  const [draft, setDraft] = useState(blankDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const team = useTeamMode(call);
  const readRoles =
    team?.enabled === true &&
    (canManage(team.viewer, 'roles.manage') || canManage(team.viewer, 'members.manage'));

  const mount = useMountedResource<HTMLElement>(() => {
    const request = new AbortController();
    setRoles([]);
    if (readRoles)
      void loadRoles(call, request.signal).then(
        (result) => {
          if (!request.signal.aborted) setRoles(result);
        },
        () => {},
      );
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
  }, [call, readRoles, refresh]);

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
    if (dialog.kind === 'add') {
      return (
        <AddModelProvider
          call={call}
          revision={dialog.revision}
          onConflict={reload}
          onClose={close}
          onAdded={() => {
            close();
            reload();
          }}
          t={t}
        />
      );
    }
    if (dialog.kind === 'receipt')
      return <SavedModelProvider receipt={dialog.receipt} onClose={close} t={t} />;
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

    const { provider } = dialog;
    const name = draft.name.trim();
    const hasKey = draft.key.trim() !== '';
    const nameChanged = provider.canRename && name !== provider.name;
    return (
      <FormDialog
        title={t('modelProviders.editTitle', { name: provider.name })}
        size="medium"
        labels={labels}
        submitLabel={t('modelProviders.save')}
        busy={busy}
        submitDisabled={(!nameChanged && !hasKey) || (nameChanged && !name)}
        error={error}
        onCancel={close}
        onSubmit={() =>
          void run(
            'modelProviderEdit',
            {
              id: provider.id,
              expectedRevision: provider.revision,
              ...(nameChanged ? { name } : {}),
              ...(hasKey ? { key: draft.key } : {}),
            },
            hasKey,
          )
        }
        secondary={
          provider.canRemove ? (
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
          {provider.canRename ? (
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
          {provider.canReplaceKey ? (
            <ProviderKeyField
              value={draft.key}
              busy={busy}
              replace
              onChange={(key) => field('key', key)}
              t={t}
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
          <ListCard label={t('modelProviders.apiKey')}>
            {view.providers.map((provider) => {
              const names = readRoles
                ? roles
                    .filter((role) => roleAllowsProvider(role, provider.id))
                    .map((role) => roleLabel(t, role))
                : [];
              return (
                <ListCardItem
                  key={provider.id}
                  leading={
                    <ModelBrandIcon brand={providerBrand(provider.id, provider.name)} size={20} />
                  }
                  title={provider.name}
                  summary={[
                    providerSummary(provider, t),
                    ...(names.length === 0
                      ? []
                      : [
                          t('modelProviders.rolesAllowed', {
                            roles: names.join(t('modelProviders.roleSeparator')),
                          }),
                        ]),
                  ].join(' · ')}
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
                        {t(provider.keyStored ? 'modelProviders.edit' : 'modelProviders.addKey')}
                      </Button>
                    ) : undefined
                  }
                />
              );
            })}
          </ListCard>
        )}
        {notice === undefined ? null : <Note tone="warning">{notice}</Note>}
      </SettingsSection>
      {canManageModelProviders(team?.viewer) ? (
        <SubscriptionAccounts call={call} roles={roles} t={t} />
      ) : null}
      {editor}
    </>
  );
}
