import { useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import { sameModel, type ModelRoute } from '../../../../apps/mobile/src/host/bot-settings.js';
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

export function RemoteHostModels({ client, t }: { client: HostClient; t: BotHarnessTranslate }) {
  const [scope, setScope] = useState<HostModelScope>({ kind: 'global' });
  return (
    <Models key={modelScopeKey(scope)} client={client} scope={scope} onScope={setScope} t={t} />
  );
}

function Models({
  client,
  scope,
  onScope,
  t,
}: {
  client: HostClient;
  scope: HostModelScope;
  onScope: (scope: HostModelScope) => void;
  t: BotHarnessTranslate;
}) {
  const [resource] = useState(() => modelSettingsResource(client, scope));
  const [value, setValue] = useState<ModelSettingsState>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string>();
  const generation = useRef(0);
  const pending = useRef(false);
  const refresh = async () => {
    const request = ++generation.current;
    setError(false);
    try {
      const next = await resource.refresh();
      if (generation.current === request) setValue(next);
    } catch {
      if (generation.current === request) setError(true);
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [resource]);
  const run = async (work: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    const request = ++generation.current;
    try {
      await resource.write(work);
      const next = await resource.refresh();
      if (generation.current === request) setValue(next);
    } catch {
      if (generation.current === request) setError(true);
    } finally {
      pending.current = false;
      if (generation.current === request) setBusy(false);
    }
  };
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
        disabled={busy}
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
      {error ? <Note tone="danger">{t('remoteHosts.settings.error')}</Note> : null}
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
                onChange={(id) => onScope(id === '' ? { kind: 'global' } : { kind: 'preset', id })}
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
                  disabled={busy || routes?.assignmentDefault === undefined}
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
                    disabled={busy || sameModel(option, routes.assignmentDefault)}
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
            disabled={busy}
            onChange={setName}
          />
          <PillButton
            disabled={
              busy ||
              (name ?? value.preset?.name ?? '').trim() === '' ||
              routes?.orchestrator === undefined
            }
            onClick={() =>
              void run(async () => {
                await saveModelPreset(
                  client,
                  value,
                  name ?? value.preset?.name ?? '',
                  scope.kind === 'preset',
                );
                setName(undefined);
              })
            }
          >
            {t(scope.kind === 'preset' ? 'modelPreset.savePreset' : 'modelPreset.saveAs')}
          </PillButton>
        </>
      )}
    </div>
  );
}
