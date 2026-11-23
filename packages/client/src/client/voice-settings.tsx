import { Button } from './ds/button.js';
import { useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import { errorMessage } from './bridge.js';
import { Field, FieldStack, TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import {
  CopyChip,
  StatusFact,
  StatusGroup,
  StatusList,
  StatusListAction,
  StatusListRow,
  type StatusTone,
} from './ds/status-block.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { providerBrand, type ModelBrand } from './model-brand.js';
import { VoiceCatalogPicker, type VoicePickerCatalog } from './voice-catalog-picker.js';
import { VoiceMicTest } from './voice-mic-test.js';
import { useMountedResource } from './mounted-resource.js';
import type {
  VoiceCatalogCollection,
  VoiceProviderHealthView,
  VoiceProvidersView,
} from './voice-bridge.js';
import { TemplateEditDialog } from './features/voice/template-edit-dialog.js';
import {
  blankDraft,
  draftFromTemplate,
  type TemplateDraft,
  type TemplateErrors,
} from './features/voice/template-draft.js';
import { examplesFor } from './features/voice/template-examples.js';
import { BLANK_EXAMPLE, checkTemplate, TemplateFields } from './features/voice/template-form.js';
import { useTeamMember } from './team-state.js';
import {
  choiceValues,
  chosenValue,
  CUSTOM_CHOICE,
  defaultProviderName,
  initialChoice,
  type Choice,
} from './voice-options.js';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    paddingBottom: space.x6,
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x6,
    minWidth: 0,
  },
});

export type VoiceActions = Pick<
  BridgeActions,
  | 'voiceProviders'
  | 'addVoiceProvider'
  | 'validateVoiceTemplate'
  | 'voiceProviderTemplate'
  | 'setVoiceProviderTemplate'
  | 'browseVoiceCatalog'
  | 'importSharedVoice'
  | 'removeVoiceProvider'
  | 'testVoiceProvider'
  | 'synthesizeVoice'
  | 'setBotVoice'
  | 'setBotAsr'
  | 'setVoiceDefault'
  | 'setSpeechThreshold'
>;

type Kind = 'tts' | 'asr';

const NONE = 'none';
const TEMPLATE_PRESET = '\u0000template';
const PROVIDER_VOICE = '\u0000provider';

interface ProviderRow {
  readonly id: string;
  readonly name: string;
  readonly preset: string;
  readonly baseUrl: string;
  readonly keySet: boolean;
  readonly defaultVoice?: string;
  readonly template?: unknown;
}

interface PresetRow {
  readonly id: string;
  readonly name: string;
  readonly baseUrl?: string;
  readonly keyRequired: boolean;
  readonly defaultModel?: string;
  readonly models?: readonly string[];
  readonly defaultVoice?: string;
  readonly voices?: readonly { readonly id: string; readonly name: string }[];
  readonly catalogs?: readonly VoiceCatalogCollection[];
}

interface Draft {
  kind: Kind;
  preset: string;
  name: string;
  baseUrl: string;
  model: Choice;
  voice: Choice;
  key: string;
  template?: TemplateDraft;
  example?: string;
}

function presetsOf(view: VoiceProvidersView, kind: Kind): readonly PresetRow[] {
  return kind === 'tts' ? view.presets : view.asrPresets;
}

function providersOf(view: VoiceProvidersView, kind: Kind): readonly ProviderRow[] {
  return kind === 'tts' ? view.providers : view.asrProviders;
}

function templateDraft(kind: Kind, example: string): Draft {
  const found = examplesFor(kind).find((entry) => entry.id === example);
  return {
    kind,
    preset: TEMPLATE_PRESET,
    name: '',
    baseUrl: '',
    model: { choice: CUSTOM_CHOICE, custom: found?.model ?? '' },
    voice: { choice: CUSTOM_CHOICE, custom: found?.voice ?? '' },
    key: '',
    template: found === undefined ? blankDraft(kind) : draftFromTemplate(found.template),
    example: found?.id ?? BLANK_EXAMPLE,
  };
}

function emptyDraft(kind: Kind, preset: PresetRow | undefined): Draft {
  return {
    kind,
    preset: preset?.id ?? 'custom',
    name: '',
    baseUrl: '',
    model: initialChoice(preset?.models ?? [], preset?.defaultModel),
    voice: initialChoice(
      (preset?.voices ?? []).map((voice) => voice.id),
      preset?.defaultVoice,
    ),
    key: '',
  };
}

function healthText(t: BotHarnessTranslate, health: VoiceProviderHealthView): string {
  return health.ok
    ? t('voice.provider.healthy', { ms: health.latencyMs })
    : t('voice.provider.unhealthy', { reason: health.message });
}

function ChoiceField({
  label,
  customLabel,
  values,
  names,
  state,
  placeholder,
  brand,
  catalog,
  t,
  onChange,
}: {
  label: string;
  customLabel: string;
  values: readonly string[];
  names?: Readonly<Record<string, string>>;
  state: Choice;
  placeholder?: string | undefined;
  brand: ModelBrand | undefined;
  catalog?: VoicePickerCatalog | undefined;
  t: BotHarnessTranslate;
  onChange: (next: Choice) => void;
}): ReactElement {
  const custom = (
    <TextField
      label={customLabel}
      value={state.custom}
      monospace
      spellCheck={false}
      autoComplete="off"
      placeholder={placeholder}
      onChange={(text) => onChange({ choice: CUSTOM_CHOICE, custom: text })}
    />
  );
  if (values.length === 0 && catalog === undefined) return custom;
  return (
    <>
      <Field label={label} group>
        {() => (
          <VoiceCatalogPicker
            label={label}
            value={state.choice}
            valueLabel={state.catalogName}
            brand={brand}
            catalog={catalog}
            options={[
              ...values.map((value) => ({
                id: value,
                name: names?.[value] ?? value,
                brand,
              })),
              { id: CUSTOM_CHOICE, name: t('voice.choice.custom'), brand: undefined },
            ]}
            t={t}
            onChange={(item, fromCatalog) =>
              onChange({
                choice: item.id,
                custom: state.custom,
                ...(fromCatalog ? { catalogName: item.name } : {}),
              })
            }
          />
        )}
      </Field>
      {state.choice === CUSTOM_CHOICE ? custom : null}
    </>
  );
}

function defaultVoiceChoice(
  voiceId: string | undefined,
  voices: readonly { readonly id: string }[],
): Choice {
  if (voiceId === undefined) return { choice: PROVIDER_VOICE, custom: '' };
  return voices.some((voice) => voice.id === voiceId)
    ? { choice: voiceId, custom: '' }
    : { choice: CUSTOM_CHOICE, custom: voiceId };
}

export function VoiceProviderSettings({
  actions,
  t,
}: {
  actions: VoiceActions;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [view, setView] = useState<VoiceProvidersView>();
  const [loadError, setLoadError] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  const [removing, setRemoving] = useState<ProviderRow>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [defaultError, setDefaultError] = useState<Partial<Record<Kind, string>>>({});
  const [voiceEdit, setVoiceEdit] = useState<Choice>();
  const [expanded, setExpanded] = useState<string>();
  const [health, setHealth] = useState<Record<string, VoiceProviderHealthView | 'testing'>>({});
  const [templateErrors, setTemplateErrors] = useState<TemplateErrors>({});
  const [editing, setEditing] = useState<{ provider: ProviderRow; kind: Kind }>();
  const member = useTeamMember();
  const load = (): void => {
    void actions
      .voiceProviders?.()
      .then((next) => {
        setView(next);
        setLoadError(undefined);
      })
      .catch((cause: unknown) => setLoadError(errorMessage(cause)));
  };
  const mount = useMountedResource<HTMLDivElement>(() => load(), [actions]);
  if (actions.voiceProviders === undefined || actions.addVoiceProvider === undefined) return null;
  const add = actions.addVoiceProvider;
  const templates =
    member ||
    actions.validateVoiceTemplate === undefined ||
    actions.voiceProviderTemplate === undefined ||
    actions.setVoiceProviderTemplate === undefined
      ? undefined
      : {
          validateVoiceTemplate: actions.validateVoiceTemplate,
          voiceProviderTemplate: actions.voiceProviderTemplate,
          setVoiceProviderTemplate: actions.setVoiceProviderTemplate,
        };
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const preset =
    draft === undefined || view === undefined
      ? undefined
      : presetsOf(view, draft.kind).find((entry) => entry.id === draft.preset);
  const test = (provider: { id: string }): void => {
    if (actions.testVoiceProvider === undefined) return;
    setHealth((current) => ({ ...current, [provider.id]: 'testing' }));
    void actions
      .testVoiceProvider(provider.id)
      .then((result) => setHealth((current) => ({ ...current, [provider.id]: result })))
      .catch((cause: unknown) =>
        setHealth((current) => ({
          ...current,
          [provider.id]: {
            ok: false,
            providerId: provider.id,
            code: 'provider-unavailable',
            message: errorMessage(cause),
          },
        })),
      );
  };
  const submit = (): void => {
    if (draft === undefined || busy) return;
    const model = chosenValue(draft.model);
    const voice = draft.kind === 'tts' ? chosenValue(draft.voice) : undefined;
    const fields = {
      ...(draft.kind === 'asr' ? { kind: 'asr' as const } : {}),
      ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
      ...(model === undefined ? {} : { model }),
      ...(voice === undefined ? {} : { defaultVoice: voice }),
      ...(draft.key.trim() ? { key: draft.key.trim() } : {}),
    };
    setBusy(true);
    setError(undefined);
    const request =
      draft.template === undefined
        ? add({
            ...fields,
            preset: draft.preset,
            ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
          })
        : templates === undefined
          ? Promise.resolve(undefined)
          : checkTemplate(templates.validateVoiceTemplate, draft.kind, draft.template, t).then(
              (checked) => {
                setTemplateErrors(checked.ok ? {} : checked.errors);
                if (checked.ok)
                  return add({ ...fields, preset: 'custom', template: checked.template });
                setError(checked.errors.form);
                return undefined;
              },
            );
    void request
      .then((provider) => {
        if (provider === undefined) return;
        setDraft(undefined);
        load();
        test(provider);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const remove = (provider: ProviderRow): void => {
    if (actions.removeVoiceProvider === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void actions
      .removeVoiceProvider(provider.id)
      .then(() => {
        setRemoving(undefined);
        setVoiceEdit(undefined);
        load();
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const setDefault = (kind: Kind, providerId: string | null, voiceId?: string): void => {
    if (actions.setVoiceDefault === undefined || busy) return;
    setBusy(true);
    setDefaultError((current) => ({ ...current, [kind]: undefined }));
    void actions
      .setVoiceDefault(kind, providerId, voiceId)
      .then((defaults) => {
        setView((current) => (current === undefined ? current : { ...current, defaults }));
        setVoiceEdit(undefined);
      })
      .catch((cause: unknown) =>
        setDefaultError((current) => ({
          ...current,
          [kind]: errorMessage(cause),
        })),
      )
      .finally(() => setBusy(false));
  };
  const defaultList = (current: VoiceProvidersView, kind: Kind): ReactElement => {
    const providers = providersOf(current, kind);
    const binding = kind === 'tts' ? current.defaults.tts : current.defaults.asr;
    const provider = providers.find((entry) => entry.id === binding?.providerId);
    const voices =
      kind === 'tts' && provider !== undefined
        ? (current.presets.find((entry) => entry.id === provider.preset)?.voices ?? [])
        : [];
    const voiceState = voiceEdit ?? defaultVoiceChoice(current.defaults.tts?.voiceId, voices);
    const failure = defaultError[kind];
    return (
      <StatusList data={{ 'data-voice-defaults': kind }}>
        {[
          <StatusListRow
            key="service"
            title={t('voice.default.title')}
            info={kind === 'tts' ? t('voice.default.ttsHint') : t('voice.default.asrHint')}
            meta={failure}
            tone={failure === undefined ? 'neutral' : 'warning'}
            data={{ 'data-voice-default': kind }}
            action={
              <Select
                label={t('voice.default.title')}
                value={binding?.providerId ?? NONE}
                disabled={busy || actions.setVoiceDefault === undefined}
                options={[
                  { value: NONE, label: t('voice.default.none') },
                  ...providers.map((entry) => ({
                    value: entry.id,
                    label: entry.name,
                  })),
                ]}
                onChange={(next) => setDefault(kind, next === NONE ? null : next)}
              />
            }
          />,
          provider === undefined || kind === 'asr' ? null : (
            <StatusListRow
              key="voice"
              title={t('voice.default.voice')}
              data={{ 'data-voice-default-voice': '' }}
              open={voiceState.choice === CUSTOM_CHOICE}
              action={
                <Select
                  label={t('voice.default.voice')}
                  value={voiceState.choice}
                  disabled={busy || actions.setVoiceDefault === undefined}
                  options={[
                    {
                      value: PROVIDER_VOICE,
                      label: provider.defaultVoice
                        ? `${t('voice.default.providerVoice')} · ${provider.defaultVoice}`
                        : t('voice.default.providerVoice'),
                    },
                    ...voices.map((voice) => ({
                      value: voice.id,
                      label: voice.name,
                    })),
                    { value: CUSTOM_CHOICE, label: t('voice.choice.custom') },
                  ]}
                  onChange={(choice) => {
                    if (choice === CUSTOM_CHOICE) {
                      setVoiceEdit({ choice, custom: voiceState.custom });
                      return;
                    }
                    setDefault('tts', provider.id, choice === PROVIDER_VOICE ? undefined : choice);
                  }}
                />
              }
            >
              <TextField
                label={t('voice.provider.voiceCustom')}
                value={voiceState.custom}
                monospace
                spellCheck={false}
                autoComplete="off"
                placeholder={provider.defaultVoice}
                onChange={(custom) => setVoiceEdit({ choice: CUSTOM_CHOICE, custom })}
              />
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    busy ||
                    voiceState.custom.trim() === '' ||
                    voiceState.custom.trim() === (current.defaults.tts?.voiceId ?? '')
                  }
                  onClick={() => setDefault('tts', provider.id, voiceState.custom.trim())}
                >
                  {t('voice.bot.save')}
                </Button>
              </span>
            </StatusListRow>
          ),
        ]}
      </StatusList>
    );
  };
  const openDraft = (current: VoiceProvidersView, kind: Kind): void => {
    setError(undefined);
    setTemplateErrors({});
    setDraft(emptyDraft(kind, presetsOf(current, kind)[0]));
  };
  const providerRow = (
    current: VoiceProvidersView,
    kind: Kind,
    provider: ProviderRow,
  ): ReactElement => {
    const state = health[provider.id];
    const presetRow = presetsOf(current, kind).find((entry) => entry.id === provider.preset);
    const presetName = presetRow?.name ?? provider.preset;
    const missingKey = presetRow?.keyRequired === true && !provider.keySet;
    const failed = state !== undefined && state !== 'testing' && !state.ok;
    const ready = state !== undefined && state !== 'testing' && state.ok;
    const tone: StatusTone = ready
      ? 'success'
      : failed || missingKey
        ? 'warning'
        : state === 'testing'
          ? 'accent'
          : 'neutral';
    return (
      <StatusListRow
        key={provider.id}
        icon={
          ready ? 'check' : tone === 'warning' ? 'info' : kind === 'tts' ? 'audio-lines' : 'mic'
        }
        tone={tone}
        title={provider.name}
        data={{ 'data-voice-provider': provider.id }}
        meta={
          <span data-voice-provider-status="">
            {state === 'testing'
              ? t('voice.provider.testing')
              : state !== undefined
                ? healthText(t, state)
                : missingKey
                  ? t('voice.provider.missingKey')
                  : presetName}
          </span>
        }
        action={
          <Button
            variant={failed || missingKey ? 'primary' : 'outline'}
            size="sm"
            disabled={state === 'testing'}
            onClick={() => test(provider)}
          >
            {t(failed ? 'voice.provider.retest' : 'voice.provider.test')}
          </Button>
        }
        open={expanded === provider.id}
        onToggle={() => setExpanded(expanded === provider.id ? undefined : provider.id)}
        toggleLabel={t('voice.provider.details')}
      >
        <StatusFact
          label={provider.keySet ? t('voice.provider.keySet') : t('voice.provider.noKey')}
          data={{ 'data-voice-provider-manage': provider.id }}
          control={
            <>
              {provider.template === undefined || templates === undefined ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  data-voice-template-edit-open={provider.id}
                  onClick={() => setEditing({ provider, kind })}
                >
                  {t('voice.template.edit')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setError(undefined);
                  setRemoving(provider);
                }}
              >
                {t('voice.provider.remove')}
              </Button>
            </>
          }
        >
          {provider.baseUrl === '' ? null : (
            <CopyChip
              value={provider.baseUrl}
              copyLabel={t('voice.provider.copyUrl')}
              copiedLabel={t('voice.provider.copied')}
              marker="data-voice-provider-url"
              well
            />
          )}
        </StatusFact>
      </StatusListRow>
    );
  };
  const section = (kind: Kind): ReactElement => {
    const title = kind === 'tts' ? t('voice.providers.title') : t('voice.asr.title');
    const providers = view === undefined ? [] : providersOf(view, kind);
    return (
      <StatusGroup
        title={title}
        info={kind === 'tts' ? t('voice.providers.description') : t('voice.asr.description')}
        data={{ 'data-voice-section': kind }}
      >
        {view === undefined ? (
          loadError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={title} />
          ) : (
            <Note tone="danger">{loadError}</Note>
          )
        ) : (
          <>
            <StatusList data={{ 'data-voice-providers-list': kind }}>
              {[
                ...providers.map((provider) => providerRow(view, kind, provider)),
                <StatusListAction
                  key="add"
                  label={kind === 'tts' ? t('voice.providers.new') : t('voice.asr.new')}
                  onClick={() => openDraft(view, kind)}
                  data={{ 'data-voice-provider-new': kind }}
                />,
              ]}
            </StatusList>
            {providers.length === 0 ? null : defaultList(view, kind)}
          </>
        )}
      </StatusGroup>
    );
  };
  const custom = draft?.template;
  const needsUrl = draft !== undefined && custom === undefined && preset?.baseUrl === undefined;
  const needsKey = preset?.keyRequired === true;
  const catalogFor = (collection: 'models' | 'account'): VoicePickerCatalog | undefined => {
    if (
      draft === undefined ||
      preset?.catalogs === undefined ||
      !preset.catalogs.includes(collection)
    )
      return undefined;
    return {
      preset: draft.preset,
      key: draft.key,
      kind: draft.kind,
      collection,
      collections: preset.catalogs,
      browse: actions.browseVoiceCatalog,
      importVoice: actions.importSharedVoice,
    };
  };
  const brand = providerBrand(draft?.preset);
  const keyField =
    draft === undefined ? null : (
      <TextField
        label={needsKey ? t('voice.provider.key') : t('voice.provider.keyOptional')}
        hint={custom === undefined ? t('voice.provider.keyHint') : t('voice.template.keyHint')}
        value={draft.key}
        type="password"
        monospace
        spellCheck={false}
        autoComplete="off"
        onChange={(key) => {
          const defaults = emptyDraft(draft.kind, preset);
          setDraft({
            ...draft,
            key,
            model: draft.model.catalogName === undefined ? draft.model : defaults.model,
            voice: draft.voice.catalogName === undefined ? draft.voice : defaults.voice,
          });
        }}
      />
    );
  const suggestedName =
    draft === undefined || view === undefined
      ? undefined
      : defaultProviderName(
          preset?.name ?? (custom === undefined ? draft.preset : t('voice.template.service')),
          [...view.providers, ...view.asrProviders],
        );
  return (
    <div ref={mount} data-voice-providers="" {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.sections)}>
        {section('tts')}
        {section('asr')}
        {view === undefined ? null : (
          <VoiceMicTest
            threshold={view.speechThreshold}
            save={
              actions.setSpeechThreshold === undefined
                ? undefined
                : async (dbfs) => {
                    const speechThreshold = await actions.setSpeechThreshold!(dbfs);
                    setView((current) =>
                      current === undefined ? current : { ...current, speechThreshold },
                    );
                  }
            }
            t={t}
          />
        )}
      </div>
      {error === undefined || draft !== undefined || removing !== undefined ? null : (
        <Note tone="danger">{error}</Note>
      )}
      {draft === undefined || view === undefined ? null : (
        <FormDialog
          title={draft.kind === 'tts' ? t('voice.providers.addTitle') : t('voice.asr.addTitle')}
          size="medium"
          scroll
          labels={labels}
          submitLabel={t('voice.providers.addSubmit')}
          submitData={{ 'data-voice-provider-submit': draft.kind }}
          submitDisabled={(needsUrl && !draft.baseUrl.trim()) || (needsKey && !draft.key.trim())}
          busy={busy}
          error={error}
          onCancel={() => setDraft(undefined)}
          onSubmit={submit}
        >
          <FieldStack>
            <VoiceCatalogPicker
              label={t('voice.provider.preset')}
              value={draft.preset}
              options={[
                ...presetsOf(view, draft.kind).map((entry) => ({
                  id: entry.id,
                  name: entry.name,
                  brand: providerBrand(entry.id),
                })),
                ...(templates === undefined
                  ? []
                  : [{ id: TEMPLATE_PRESET, name: t('voice.template.service'), brand: undefined }]),
              ]}
              t={t}
              onChange={(next) => {
                setTemplateErrors({});
                setDraft(
                  next.id === TEMPLATE_PRESET
                    ? templateDraft(draft.kind, BLANK_EXAMPLE)
                    : emptyDraft(
                        draft.kind,
                        presetsOf(view, draft.kind).find((entry) => entry.id === next.id),
                      ),
                );
              }}
            />
            <TextField
              label={t('voice.provider.name')}
              hint={
                suggestedName === undefined
                  ? undefined
                  : t('voice.provider.nameHint', { name: suggestedName })
              }
              value={draft.name}
              placeholder={suggestedName}
              autoComplete="off"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            {needsUrl ? (
              <TextField
                label={t('voice.provider.baseUrl')}
                hint={
                  draft.kind === 'tts'
                    ? t('voice.provider.baseUrlHint')
                    : t('voice.asr.baseUrlHint')
                }
                value={draft.baseUrl}
                monospace
                spellCheck={false}
                autoComplete="off"
                placeholder={
                  draft.kind === 'tts' ? 'http://127.0.0.1:8880/v1' : 'http://127.0.0.1:8000/v1'
                }
                onChange={(baseUrl) => setDraft({ ...draft, baseUrl })}
              />
            ) : null}
            {custom === undefined ? (
              keyField
            ) : (
              <TemplateFields
                kind={draft.kind}
                draft={custom}
                errors={templateErrors}
                example={{
                  value: draft.example ?? BLANK_EXAMPLE,
                  onChange: (example) =>
                    setDraft({
                      ...templateDraft(draft.kind, example),
                      name: draft.name,
                      key: draft.key,
                    }),
                }}
                keyField={keyField}
                t={t}
                onChange={(template) => setDraft({ ...draft, template })}
              />
            )}
            <ChoiceField
              label={t('voice.provider.model')}
              customLabel={
                (preset?.models ?? []).length === 0
                  ? t('voice.provider.model')
                  : t('voice.provider.modelCustom')
              }
              values={choiceValues(preset?.models ?? [], preset?.defaultModel)}
              state={draft.model}
              placeholder={preset?.defaultModel}
              brand={brand}
              catalog={catalogFor('models')}
              t={t}
              onChange={(model) =>
                setDraft((current) =>
                  current?.preset === draft.preset && current.key === draft.key
                    ? { ...current, model }
                    : current,
                )
              }
            />
            {draft.kind === 'tts' ? (
              <ChoiceField
                label={t('voice.provider.voice')}
                customLabel={
                  (preset?.voices ?? []).length === 0
                    ? t('voice.provider.voice')
                    : t('voice.provider.voiceCustom')
                }
                values={choiceValues(
                  (preset?.voices ?? []).map((voice) => voice.id),
                  preset?.defaultVoice,
                )}
                names={Object.fromEntries(
                  (preset?.voices ?? []).map((voice) => [voice.id, voice.name]),
                )}
                state={draft.voice}
                placeholder={preset?.defaultVoice}
                brand={brand}
                catalog={catalogFor('account')}
                t={t}
                onChange={(voice) =>
                  setDraft((current) =>
                    current?.preset === draft.preset && current.key === draft.key
                      ? { ...current, voice }
                      : current,
                  )
                }
              />
            ) : null}
          </FieldStack>
        </FormDialog>
      )}
      {editing === undefined || templates === undefined ? null : (
        <TemplateEditDialog
          provider={editing.provider}
          kind={editing.kind}
          actions={templates}
          t={t}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            const { provider } = editing;
            setEditing(undefined);
            load();
            test(provider);
          }}
        />
      )}
      {removing === undefined ? null : (
        <ConfirmDialog
          title={t('voice.provider.removeTitle', { name: removing.name })}
          description={t('voice.provider.removeDescription')}
          labels={labels}
          confirmLabel={t('voice.provider.remove')}
          busy={busy}
          error={error}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => remove(removing)}
        />
      )}
    </div>
  );
}
