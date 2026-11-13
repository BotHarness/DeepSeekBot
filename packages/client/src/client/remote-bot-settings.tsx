import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import {
  botSettings,
  type HostFolderListing,
  type WorkspaceOption,
  type WorkspaceGrant,
} from '../../../../apps/mobile/src/host/bot-settings.js';
import {
  modelSettingsResource,
  setModelRoute,
  type ModelScope,
  type ModelSettingsState,
} from '../../../../apps/mobile/src/host/model-settings.js';
import { hostSettingsDrafts, type HostDraftChoice } from './host-settings-drafts.js';
import {
  remoteBotSettingsClient,
  remoteBotSettingsTarget,
  type RemoteBotSettingsTarget,
} from './remote-bot-settings-target.js';
import { remoteHosts } from './remote-hosts.js';
import { useMountedResource } from './mounted-resource.js';
import { SettingsDialog } from './ds/settings-dialog.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { PillButton } from './ds/pill-button.js';
import { space } from './ds/tokens.stylex.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ModelPicker } from './model-picker.js';
import { FolderBrowser } from './workspace-grants-entry.js';
import { templateTitle } from './approval-template-entry.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
});

function useSetting<T>(load: () => Promise<T>, available: boolean) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<'unsupported' | 'failed'>();
  const [busy, setBusy] = useState(false);
  const current = useRef({ active: false, available, pending: false, generation: 0 });
  current.current.available = available;
  const refresh = async () => {
    const generation = ++current.current.generation;
    try {
      const next = await load();
      if (current.current.active && generation === current.current.generation) {
        setValue(next);
        setError(undefined);
      }
      return next;
    } catch (cause) {
      if (current.current.active && generation === current.current.generation)
        setError(
          typeof cause === 'object' &&
            cause !== null &&
            'code' in cause &&
            (cause.code === 'gateway/method-not-found' ||
              cause.code === 'not-supported' ||
              cause.code === 'method-not-found')
            ? 'unsupported'
            : 'failed',
        );
      throw cause;
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    current.current.active = true;
    void refresh().catch(() => undefined);
    return () => {
      current.current.active = false;
      current.current.generation++;
    };
  }, []);
  const run = async (work: () => Promise<unknown>) => {
    if (!current.current.active || !current.current.available || current.current.pending)
      return false;
    current.current.pending = true;
    setBusy(true);
    try {
      await work();
      await refresh();
      return current.current.active && current.current.available;
    } catch {
      await refresh().catch(() => undefined);
      if (current.current.active) setError('failed');
      return false;
    } finally {
      current.current.pending = false;
      if (current.current.active) setBusy(false);
    }
  };
  return { value, error, busy, mount, run, refresh };
}

export function RemoteBotSettingsView({ t }: { t: BotHarnessTranslate }) {
  const target = useSyncExternalStore(
    remoteBotSettingsTarget.subscribe,
    remoteBotSettingsTarget.getSnapshot,
  );
  return target === undefined ? null : (
    <RemoteBotSettings key={target.session} target={target} t={t} />
  );
}

function RemoteBotSettings({
  target,
  t,
}: {
  target: RemoteBotSettingsTarget;
  t: BotHarnessTranslate;
}) {
  const sources = remoteHosts();
  const snapshot = useSyncExternalStore(
    sources.subscribe,
    sources.getSnapshot,
    sources.getSnapshot,
  );
  const available =
    sources.client(target.hostId) === target.client &&
    snapshot.hosts.some(
      ({ host, snapshot }) =>
        host.hostId === target.hostId && snapshot.connection.status === 'connected',
    );
  const client = useMemo(() => remoteBotSettingsClient(target, sources.client), [sources, target]);
  const [section, setSection] = useState('profile');
  const [prompt, setPrompt] = useState(false);
  const choice = useRef<(value: HostDraftChoice) => void>();
  const settle = (value: HostDraftChoice) => {
    const resolve = choice.current;
    choice.current = undefined;
    setPrompt(false);
    resolve?.(value);
  };
  const mount = useMountedResource<HTMLSpanElement>(() => {
    const release = hostSettingsDrafts.prompt(
      target.hostId,
      () =>
        new Promise((resolve) => {
          choice.current = resolve;
          setPrompt(true);
        }),
    );
    return () => {
      release();
      choice.current?.('cancel');
    };
  }, [target]);
  const sections = [
    {
      id: 'profile',
      label: t('remoteBotSettings.profile'),
      icon: <ChannelSidebarIcon name="bot" />,
    },
    {
      id: 'models',
      label: t('botSettings.section.models'),
      icon: <ChannelSidebarIcon name="cpu" />,
    },
    {
      id: 'workspaces',
      label: t('remoteBotSettings.workspaces'),
      icon: <ChannelSidebarIcon name="folder" />,
    },
    {
      id: 'approval',
      label: t('botSettings.section.autoApproval'),
      icon: <ChannelSidebarIcon name="shield-check" />,
    },
  ];
  return (
    <SettingsDialog
      title={t('remoteBotSettings.title', { name: target.name })}
      caption={`${target.hostName} · ${target.name}`}
      sections={sections}
      activeId={section}
      onSelect={(id) => {
        if (id !== section)
          void hostSettingsDrafts.prepare(target.hostId).then((ready) => {
            if (ready) setSection(id);
          });
      }}
      onClose={() => {
        void remoteBotSettingsTarget.close();
      }}
      labels={{ nav: t('botSettings.nav'), close: t('common.close'), picker: (label) => label }}
    >
      <span ref={mount} hidden />
      {prompt ? (
        <FormDialog
          title={t('relationships.unsaved')}
          description={t('relationships.unsavedHint')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t('relationships.save')}
          onCancel={() => settle('cancel')}
          onSubmit={() => settle('save')}
          secondary={
            <Button variant="outline" onClick={() => settle('discard')}>
              {t('relationships.discard')}
            </Button>
          }
        />
      ) : null}
      {!available ? <Note tone="danger">{t('environment.settings.disconnected')}</Note> : null}
      {section === 'profile' ? (
        <Profile target={target} client={client} available={available} t={t} />
      ) : section === 'models' ? (
        <Models target={target} client={client} available={available} t={t} />
      ) : section === 'workspaces' ? (
        <Workspaces target={target} client={client} available={available} t={t} />
      ) : (
        <Approval target={target} client={client} available={available} t={t} />
      )}
    </SettingsDialog>
  );
}

interface SettingProps {
  target: RemoteBotSettingsTarget;
  client: HostClient;
  available: boolean;
  t: BotHarnessTranslate;
}

function SettingStatus({
  state,
  t,
}: {
  state: {
    error: 'unsupported' | 'failed' | undefined;
    busy: boolean;
    refresh(): Promise<unknown>;
  };
  t: BotHarnessTranslate;
}) {
  return (
    <>
      {state.error ? (
        <Note tone="danger">
          {t(
            state.error === 'unsupported'
              ? 'remoteBotSettings.unsupported'
              : 'remoteBotSettings.failed',
          )}
        </Note>
      ) : null}
      <PillButton
        disabled={state.busy}
        onClick={() => {
          void state.refresh().catch(() => undefined);
        }}
      >
        {t('remoteBotSettings.refresh')}
      </PillButton>
    </>
  );
}

function Profile({ target, client, available, t }: SettingProps) {
  const state = useSetting(
    () =>
      client.call<{ bot: { slug: string; displayName: string }; profileFingerprint: string }>(
        'get',
        { slug: target.slug },
      ),
    available,
  );
  const [name, setName] = useState<string>();
  const save = async () => {
    const value = state.value;
    if (
      value === undefined ||
      value.bot.slug !== target.slug ||
      name === undefined ||
      name.trim() === ''
    )
      return false;
    const saved = await state.run(() =>
      client.call('update', {
        slug: target.slug,
        patch: { displayName: name.trim() },
        expectedProfile: value.profileFingerprint,
      }),
    );
    if (saved) {
      draft.current.name = undefined;
      setName(undefined);
    }
    return saved;
  };
  const draft = useRef({ name, value: state.value, save });
  draft.current = { name, value: state.value, save };
  const mount = useMountedResource<HTMLSpanElement>(
    () =>
      hostSettingsDrafts.register(target.hostId, {
        dirty: () =>
          draft.current.name !== undefined &&
          draft.current.name.trim() !== draft.current.value?.bot.displayName,
        save: () => draft.current.save(),
        discard: () => {
          draft.current.name = undefined;
          setName(undefined);
        },
      }),
    [target],
  );
  return (
    <div ref={state.mount} {...stylex.props(styles.stack)}>
      <span ref={mount} hidden />
      <SettingStatus state={state} t={t} />
      <TextField
        label={t('remoteBotSettings.name')}
        value={name ?? state.value?.bot.displayName ?? ''}
        disabled={state.busy || state.value === undefined}
        onChange={setName}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void save();
          }
        }}
      />
      <PillButton
        disabled={
          !available ||
          state.busy ||
          state.value === undefined ||
          name === undefined ||
          name.trim() === '' ||
          name.trim() === state.value.bot.displayName
        }
        onClick={() => {
          void save();
        }}
      >
        {t('relationships.save')}
      </PillButton>
      <Note>{t('remoteBotSettings.localOnly')}</Note>
    </div>
  );
}

function Models({ target, client, available, t }: SettingProps) {
  const scope = useMemo<ModelScope>(() => ({ kind: 'bot', slug: target.slug }), [target.slug]);
  const resource = useMemo(() => modelSettingsResource(client, scope), [client, scope]);
  const state = useSetting<ModelSettingsState>(() => resource.refresh(), available);
  const value = state.value;
  const route = value?.plan?.orchestrator ?? value?.fallback;
  return (
    <div ref={state.mount} {...stylex.props(styles.stack)}>
      <SettingStatus state={state} t={t} />
      {value === undefined ? null : (
        <>
          <ModelPicker
            title={t('modelPreset.orchestrator')}
            hint={t('modelPreset.orchestratorHint')}
            choice={{
              key: route === undefined ? '' : JSON.stringify([route.provider, route.model]),
              effort: route?.reasoningEffort ?? '',
            }}
            catalog={value.models.map((entry) => ({ ...entry, efforts: entry.efforts ?? [] }))}
            options={value.models.map((entry) => ({
              value: JSON.stringify([entry.provider, entry.model]),
              label: entry.modelName,
              hint: entry.providerName,
              disabled: entry.credential !== undefined,
            }))}
            disabled={!available || state.busy}
            t={t}
            onChange={({ key, effort }) => {
              const entry = value.models.find(
                (entry) => JSON.stringify([entry.provider, entry.model]) === key,
              );
              if (entry !== undefined)
                void state.run(() =>
                  resource.write(() =>
                    setModelRoute(client, scope, value, 'orchestrator', {
                      provider: entry.provider,
                      model: entry.model,
                      ...(effort === '' ? {} : { reasoningEffort: effort }),
                    }),
                  ),
                );
            }}
          />
          <SettingsRow
            title={t('remoteBotSettings.preset')}
            control={
              <Select
                label={t('remoteBotSettings.preset')}
                value=""
                disabled={!available || state.busy}
                options={[
                  { value: '', label: t('remoteBotSettings.choosePreset') },
                  ...value.presets.map((preset) => ({ value: preset.id, label: preset.name })),
                ]}
                onChange={(id) => {
                  const preset = value.presets.find((preset) => preset.id === id);
                  if (preset === undefined || preset.revision === undefined) return;
                  void state.run(() =>
                    resource.write(async () => {
                      await client.call('modelPresetApply', {
                        slug: target.slug,
                        presetId: id,
                        expectedRevision: value.plan?.revision ?? value.revision,
                        expectedPresetRevision: preset.revision,
                      });
                    }),
                  );
                }}
              />
            }
          />
        </>
      )}
    </div>
  );
}

function Workspaces({ target, client, available, t }: SettingProps) {
  const actions = useMemo(() => botSettings(client, target.slug), [client, target.slug]);
  const state = useSetting(
    async () => ({
      grants: await actions.loadGrants(),
      workspaces: await actions.loadWorkspaceOptions(),
    }),
    available,
  );
  const [listing, setListing] = useState<HostFolderListing>();
  const [confirm, setConfirm] = useState<
    { kind: 'grant'; workspace: WorkspaceOption } | { kind: 'revoke'; grant: WorkspaceGrant }
  >();
  const folderActions = useMemo(
    () => ({ listHostFolders: (path?: string) => actions.listFolders(path) }),
    [actions],
  );
  return (
    <div ref={state.mount} {...stylex.props(styles.stack)}>
      <SettingStatus state={state} t={t} />
      <SettingsSection title={t('remoteBotSettings.workspaces')}>
        {state.value?.grants.map((grant) => (
          <SettingsRow
            key={grant.id}
            title={grant.workspaceTitle}
            description={grant.workspacePath}
            control={
              <PillButton
                disabled={!available || state.busy}
                onClick={() => setConfirm({ kind: 'revoke', grant })}
              >
                {t('remoteBotSettings.revoke')}
              </PillButton>
            }
          />
        ))}
        <Select
          label={t('remoteBotSettings.authorize')}
          value=""
          disabled={!available || state.busy || state.value === undefined}
          options={[
            { value: '', label: t('remoteBotSettings.chooseWorkspace') },
            ...(state.value?.workspaces ?? [])
              .filter(
                (workspace) =>
                  !state.value?.grants.some((grant) => grant.workspaceId === workspace.id),
              )
              .map((workspace) => ({ value: workspace.id, label: workspace.path })),
          ]}
          onChange={(id) => {
            const workspace = state.value?.workspaces.find((workspace) => workspace.id === id);
            if (workspace) setConfirm({ kind: 'grant', workspace });
          }}
        />
        <PillButton
          disabled={!available || state.busy}
          onClick={() => {
            void state.run(async () => {
              setListing(await actions.listFolders());
            });
          }}
        >
          {t('remoteBotSettings.browse')}
        </PillButton>
      </SettingsSection>
      {listing === undefined ? null : (
        <FolderBrowser
          initial={listing}
          actions={folderActions}
          busy={!available || state.busy}
          t={t}
          onCancel={() => setListing(undefined)}
          onChoose={(path) => {
            void state.run(async () => {
              const workspace = await actions.resolveFolder(path);
              setListing(undefined);
              setConfirm({ kind: 'grant', workspace });
            });
          }}
        />
      )}
      {confirm === undefined ? null : (
        <ConfirmDialog
          title={t(
            confirm.kind === 'grant' ? 'remoteBotSettings.authorize' : 'remoteBotSettings.revoke',
          )}
          description={
            confirm.kind === 'grant'
              ? t('remoteBotSettings.grantHint', {
                  name: target.name,
                  path: confirm.workspace.path,
                })
              : t('remoteBotSettings.revokeHint', {
                  name: target.name,
                  path: confirm.grant.workspacePath,
                })
          }
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t(
            confirm.kind === 'grant' ? 'remoteBotSettings.authorize' : 'remoteBotSettings.revoke',
          )}
          danger={confirm.kind === 'revoke'}
          busy={state.busy}
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => {
            void state
              .run(() =>
                confirm.kind === 'grant'
                  ? actions.authorizeFolder(confirm.workspace.path, confirm.workspace.id)
                  : actions.revokeGrant(confirm.grant.id),
              )
              .then((saved) => {
                if (saved) setConfirm(undefined);
              });
          }}
        />
      )}
    </div>
  );
}

function Approval({ target, client, available, t }: SettingProps) {
  const actions = useMemo(() => botSettings(client, target.slug), [client, target.slug]);
  const state = useSetting(() => actions.loadTemplates(), available);
  return (
    <div ref={state.mount} {...stylex.props(styles.stack)}>
      <SettingStatus state={state} t={t} />
      <SettingsRow
        title={t('autoApproval.title')}
        control={
          <Select
            label={t('autoApproval.title')}
            value={state.value?.selected ?? ''}
            options={[
              { value: '', label: t('autoApproval.off') },
              ...(state.value?.templates ?? []).map((template) => ({
                value: template.name,
                label: templateTitle(t, template.name, template.title),
              })),
            ]}
            disabled={!available || state.busy || state.value === undefined}
            onChange={(value) => {
              void state.run(() => actions.setTemplate(value === '' ? null : value));
            }}
          />
        }
      />
    </div>
  );
}
