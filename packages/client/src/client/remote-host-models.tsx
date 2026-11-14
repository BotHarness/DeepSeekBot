import { useMemo, useRef, useState } from 'react';
import { hostSettingsDrafts } from './host-settings-drafts.js';
import * as stylex from '@stylexjs/stylex';
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  sameModel,
  HostAnswerInvalid,
  type ModelRoute,
  type ModelSettingsClient,
} from '../../../../apps/mobile/src/host/bot-settings.js';
import {
  modelRoutes,
  modelScopeKey,
  modelSettingsResource,
  saveModelPreset,
  setModelRoute,
  toggleAssignmentModel,
  type ModelScope,
  type ModelSettingsState,
} from '../../../../apps/mobile/src/host/model-settings.js';
import { Combobox } from './combobox.js';
import { TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { PillButton } from './ds/pill-button.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelPicker } from './model-picker.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0 },
  choices: { display: 'flex', flexDirection: 'column', gap: space.x3 },
});

type HostModelScope = Exclude<ModelScope, { kind: 'bot' }>;
type PresetCreation =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'unknown' }
  | { kind: 'receipt'; id: string };

function settingsFailure(cause: unknown): 'unsupported' | 'locked' | 'failed' {
  if (unsupported(cause)) return 'unsupported';
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'invalid-input' &&
    'message' in cause &&
    typeof cause.message === 'string' &&
    cause.message.includes(
      '"agent-default-model" is overridden by a home patch or command-line overlay',
    )
  )
    return 'locked';
  return 'failed';
}

function unsupported(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'gateway/method-not-found' ||
      error.code === 'not-supported' ||
      error.code === 'method-not-found')
  );
}

export function RemoteHostModels({
  hostId,
  client,
  available = true,
  t,
}: {
  hostId: string;
  client: ModelSettingsClient;
  available?: boolean;
  t: BotHarnessTranslate;
}) {
  const [owner, setOwner] = useState({ client, generation: 0 });
  if (owner.client !== client) {
    setOwner({ client, generation: owner.generation + 1 });
    return null;
  }
  return (
    <ModelSettingsSession
      key={owner.generation}
      hostId={hostId}
      client={client}
      available={available}
      t={t}
    />
  );
}

function ModelSettingsSession({
  hostId,
  client,
  available,
  t,
}: {
  hostId: string;
  client: ModelSettingsClient;
  available: boolean;
  t: BotHarnessTranslate;
}) {
  const [scope, setScope] = useState<HostModelScope>({ kind: 'global' });
  return (
    <Models
      key={modelScopeKey(scope)}
      hostId={hostId}
      client={client}
      available={available}
      scope={scope}
      onScope={setScope}
      t={t}
    />
  );
}

function Models({
  hostId,
  client,
  scope,
  available,
  onScope,
  t,
}: {
  hostId: string;
  client: ModelSettingsClient;
  scope: HostModelScope;
  available: boolean;
  onScope: (scope: HostModelScope) => void;
  t: BotHarnessTranslate;
}) {
  const resource = useMemo(() => modelSettingsResource(client, scope), [client, scope]);
  const [value, setValue] = useState<ModelSettingsState>();
  const [error, setError] = useState<ReturnType<typeof settingsFailure>>();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string>();
  const [creation, setCreation] = useState<PresetCreation>({ kind: 'idle' });
  const creationOwner = useRef<PresetCreation>(creation);
  const generation = useRef(0);
  const pending = useRef(false);
  const refresh = async () => {
    const request = ++generation.current;
    setError(undefined);
    try {
      const next = await resource.refresh();
      if (generation.current === request) setValue(next);
    } catch (cause) {
      if (generation.current === request) setError(settingsFailure(cause));
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [resource]);
  const run = async (work: () => Promise<void>, onSaved?: (value: ModelSettingsState) => void) => {
    if (pending.current || !available) return false;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    const request = ++generation.current;
    try {
      await resource.write(work);
      const next = await resource.refresh();
      if (generation.current === request) {
        setValue(next);
        onSaved?.(next);
      }
      return generation.current === request;
    } catch (cause) {
      const observed = await resource.refresh().catch(() => undefined);
      if (generation.current === request) {
        if (observed !== undefined) setValue(observed);
        setError(settingsFailure(cause));
      }
      return false;
    } finally {
      pending.current = false;
      if (generation.current === request) setBusy(false);
    }
  };
  const savePresetDraft = async () => {
    if (name === undefined || value === undefined || pending.current || !available) return false;
    if (scope.kind === 'global' && creationOwner.current.kind === 'unknown') return false;
    const request = generation.current + 1;
    const record = (outcome: PresetCreation) => {
      creationOwner.current = outcome;
      if (generation.current === request) setCreation(outcome);
    };
    return run(
      async () => {
        if (scope.kind === 'preset') {
          await saveModelPreset(client, value, name, true);
        } else if (creationOwner.current.kind === 'idle') {
          record({ kind: 'pending' });
          try {
            const id = await saveModelPreset(client, value, name, false);
            record({ kind: 'receipt', id });
          } catch (cause) {
            if (
              (cause instanceof HostAnswerInvalid && cause.message !== 'MODEL_PRESET_NOT_SAVED') ||
              (typeof cause === 'object' &&
                cause !== null &&
                'code' in cause &&
                typeof cause.code === 'string' &&
                [
                  'invalid-input',
                  'stale-setting',
                  'model-unavailable',
                  'gateway/method-not-found',
                  'not-supported',
                  'forbidden',
                ].includes(cause.code))
            )
              record({ kind: 'idle' });
            else record({ kind: 'unknown' });
            throw cause;
          }
        }
      },
      (observed) => {
        const receipt = creationOwner.current;
        if (
          scope.kind === 'global' &&
          (receipt.kind !== 'receipt' ||
            !observed.presets.some((preset) => preset.id === receipt.id))
        )
          throw Error('Created preset owner readback is not yet confirmed');
        record({ kind: 'idle' });
        if (draft.current.name === name) {
          setName(undefined);
          draft.current.name = undefined;
        }
      },
    );
  };
  const saveName = () => {
    if (
      scope.kind !== 'preset' ||
      value?.preset === undefined ||
      name === undefined ||
      name.trim() === value.preset.name
    )
      return;
    void savePresetDraft();
  };
  const draft = useRef({ name, value, scope, available, savePresetDraft });
  draft.current = { name, value, scope, available, savePresetDraft };
  const draftMount = useMountedResource<HTMLSpanElement>(
    () =>
      hostSettingsDrafts.register(hostId, {
        dirty: () =>
          draft.current.name !== undefined &&
          (draft.current.scope.kind === 'global'
            ? draft.current.name !== ''
            : draft.current.name.trim() !== draft.current.value?.preset?.name),
        async save() {
          const { name, value, savePresetDraft } = draft.current;
          if (
            name === undefined ||
            value === undefined ||
            pending.current ||
            !draft.current.available
          )
            return false;
          return savePresetDraft();
        },
        discard: () => {
          draft.current.name = undefined;
          setName(undefined);
        },
      }),
    [hostId, client, resource],
  );
  const routes = value === undefined ? undefined : modelRoutes(value);
  const picker = (field: 'orchestrator' | 'assignment', route: ModelRoute | undefined) =>
    value === undefined ? null : (
      <ModelPicker
        title={t(
          scope.kind === 'global'
            ? 'onboarding.defaultTitle'
            : field === 'orchestrator'
              ? 'modelPreset.orchestrator'
              : 'modelPreset.assignment',
        )}
        hint={t(
          scope.kind === 'global'
            ? 'onboarding.defaultDescription'
            : field === 'orchestrator'
              ? 'modelPreset.orchestratorHint'
              : 'modelPreset.assignmentHint',
        )}
        choice={{
          key: route === undefined ? '' : JSON.stringify([route.provider, route.model]),
          effort: route?.reasoningEffort ?? '',
        }}
        catalog={value.models.map((entry) => ({ ...entry, efforts: entry.efforts ?? [] }))}
        options={value.models.map((entry) => ({
          value: JSON.stringify([entry.provider, entry.model]),
          label: entry.modelName,
          hint: `${entry.providerName}${entry.credential === undefined ? '' : ` · ${t('onboarding.needsKey')}`}`,
          disabled: entry.credential !== undefined,
        }))}
        disabled={busy || !available || creation.kind !== 'idle'}
        t={t}
        onChange={({ key, effort }) => {
          const entry = value.models.find(
            (item) => JSON.stringify([item.provider, item.model]) === key,
          );
          if (entry === undefined) return;
          void run(() =>
            setModelRoute(client, scope, value, field, {
              provider: entry.provider,
              model: entry.model,
              ...(effort === '' ? {} : { reasoningEffort: effort }),
            }),
          );
        }}
      />
    );
  return (
    <div ref={mount} {...stylex.props(styles.stack)} data-remote-models="">
      <span ref={draftMount} hidden />
      {creation.kind === 'unknown' ? (
        <Note tone="danger">{t('environment.settings.createUnknown')}</Note>
      ) : null}
      {error && creation.kind !== 'unknown' ? (
        <Note tone="danger">
          {t(
            error === 'unsupported'
              ? 'environment.settings.unsupported'
              : error === 'locked'
                ? 'environment.settings.defaultLocked'
                : 'remoteHosts.settings.error',
          )}
        </Note>
      ) : null}
      <PillButton disabled={busy} onClick={() => void refresh()}>
        {t('onboarding.refreshModels')}
      </PillButton>
      {value === undefined ? (
        error ? null : (
          <p role="status">{t('modelPreset.loading')}</p>
        )
      ) : (
        <>
          <SettingsRow
            title={t('remoteHosts.settings.models')}
            control={
              <Select
                value={scope.kind === 'preset' ? scope.id : ''}
                options={[
                  { value: '', label: t('onboarding.defaultTitle') },
                  ...value.presets.map((preset) => ({ value: preset.id, label: preset.name })),
                ]}
                label={t('remoteHosts.settings.models')}
                disabled={busy}
                onChange={(id) => {
                  void hostSettingsDrafts.prepare(hostId).then((ready) => {
                    if (ready) onScope(id === '' ? { kind: 'global' } : { kind: 'preset', id });
                  });
                }}
              />
            }
          />
          {picker('orchestrator', routes?.orchestrator)}
          {scope.kind !== 'preset' ? null : (
            <>
              {picker('assignment', routes?.assignmentDefault)}
              <div {...stylex.props(styles.choices)}>
                <Combobox
                  value=""
                  options={value.models
                    .filter(
                      (entry) =>
                        entry.credential === undefined &&
                        !routes?.assignmentModels.some((option) => sameModel(option, entry)),
                    )
                    .map((entry) => ({
                      value: JSON.stringify([entry.provider, entry.model]),
                      label: entry.modelName,
                      hint: entry.providerName,
                    }))}
                  label={t('modelPreset.allowedTitle')}
                  toggleLabel={t('modelPreset.showModels')}
                  placeholder={t('modelPreset.chooseModel')}
                  emptyLabel={t('modelPreset.noMatch')}
                  disabled={busy || !available || routes?.assignmentDefault === undefined}
                  onSelect={(key) => {
                    const entry = value.models.find(
                      (item) => JSON.stringify([item.provider, item.model]) === key,
                    );
                    if (entry !== undefined)
                      void run(() => toggleAssignmentModel(client, scope, value, entry));
                  }}
                />
                {routes?.assignmentModels.map((option) => (
                  <Checkbox
                    key={JSON.stringify([option.provider, option.model])}
                    checked
                    label={`${option.model} · ${option.provider}`}
                    disabled={busy || !available || sameModel(option, routes.assignmentDefault)}
                    onChange={() => {
                      const entry = value.models.find((item) => sameModel(item, option));
                      if (entry !== undefined)
                        void run(() => toggleAssignmentModel(client, scope, value, entry));
                    }}
                  />
                ))}
              </div>
            </>
          )}
          <TextField
            label={t('modelPreset.name')}
            value={name ?? value.preset?.name ?? ''}
            disabled={busy || creation.kind !== 'idle'}
            onChange={setName}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                saveName();
              }
            }}
          />
          {scope.kind === 'preset' ? (
            <PillButton
              disabled={
                busy || !available || name === undefined || name.trim() === value.preset?.name
              }
              onClick={saveName}
            >
              {t('relationships.save')}
            </PillButton>
          ) : null}
          {scope.kind === 'global' ? (
            <PillButton
              disabled={
                busy ||
                creation.kind === 'unknown' ||
                !available ||
                (name ?? value.preset?.name ?? '').trim() === '' ||
                routes?.orchestrator === undefined
              }
              onClick={() => {
                void savePresetDraft();
              }}
            >
              {t(
                creation.kind === 'receipt'
                  ? 'environment.settings.checkCreatedPreset'
                  : 'modelPreset.saveAs',
              )}
            </PillButton>
          ) : null}
        </>
      )}
    </div>
  );
}
