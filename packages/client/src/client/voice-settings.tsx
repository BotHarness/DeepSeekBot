import { useState, type ReactElement, type RefCallback } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { errorMessage } from './bridge.js';
import { Field, FieldStack, TextAreaField, TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { MessageAudio } from './message-audio.js';
import { VoiceMicTest } from './voice-mic-test.js';
import { useMountedResource } from './mounted-resource.js';
import type { VoiceProviderHealthView, VoiceProvidersView } from './voice-bridge.js';
import {
  choiceValues,
  chosenValue,
  CUSTOM_CHOICE,
  defaultProviderName,
  initialChoice,
  type Choice,
} from './voice-options.js';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', minWidth: 0, paddingBottom: space.x6 },
});

type VoiceActions = Pick<
  BridgeActions,
  | 'voiceProviders'
  | 'addVoiceProvider'
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
const FOLLOW = 'follow';
const PROVIDER_VOICE = '\u0000provider';

interface ProviderRow {
  readonly id: string;
  readonly name: string;
  readonly preset: string;
  readonly baseUrl: string;
  readonly keySet: boolean;
  readonly defaultVoice?: string;
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
}

interface Draft {
  kind: Kind;
  preset: string;
  name: string;
  baseUrl: string;
  model: Choice;
  voice: Choice;
  key: string;
}

function presetsOf(view: VoiceProvidersView, kind: Kind): readonly PresetRow[] {
  return kind === 'tts' ? view.presets : view.asrPresets;
}

function providersOf(view: VoiceProvidersView, kind: Kind): readonly ProviderRow[] {
  return kind === 'tts' ? view.providers : view.asrProviders;
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
  t,
  onChange,
}: {
  label: string;
  customLabel: string;
  values: readonly string[];
  names?: Readonly<Record<string, string>>;
  state: Choice;
  placeholder?: string | undefined;
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
  if (values.length === 0) return custom;
  return (
    <>
      <Field label={label} group>
        {() => (
          <Select
            label={label}
            value={state.choice}
            align="start"
            options={[
              ...values.map((value) => ({ value, label: names?.[value] ?? value })),
              { value: CUSTOM_CHOICE, label: t('voice.choice.custom') },
            ]}
            onChange={(choice) => onChange({ ...state, choice })}
          />
        )}
      </Field>
      {state.choice === CUSTOM_CHOICE ? custom : null}
    </>
  );
}

function usePreviewUrl(): [
  string | undefined,
  (audio: string, mime: string) => void,
  RefCallback<HTMLDivElement>,
] {
  const [url, setUrl] = useState<string>();
  const release = useMountedResource<HTMLDivElement>(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  return [
    url,
    (audio, mime) => {
      const bytes = Uint8Array.from(atob(audio), (char) => char.charCodeAt(0));
      setUrl(URL.createObjectURL(new Blob([bytes], { type: mime })));
    },
    release,
  ];
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
  const [health, setHealth] = useState<Record<string, VoiceProviderHealthView | 'testing'>>({});
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
    setBusy(true);
    setError(undefined);
    void add({
      ...(draft.kind === 'asr' ? { kind: 'asr' as const } : {}),
      preset: draft.preset,
      ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
      ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
      ...(model === undefined ? {} : { model }),
      ...(voice === undefined ? {} : { defaultVoice: voice }),
      ...(draft.key.trim() ? { key: draft.key.trim() } : {}),
    })
      .then((provider) => {
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
        setDefaultError((current) => ({ ...current, [kind]: errorMessage(cause) })),
      )
      .finally(() => setBusy(false));
  };
  const defaultRow = (current: VoiceProvidersView, kind: Kind): ReactElement => {
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
      <SettingsRow
        title={t('voice.default.title')}
        description={kind === 'tts' ? t('voice.default.ttsHint') : t('voice.default.asrHint')}
        data={{ 'data-voice-default': kind }}
        control={
          <Select
            label={t('voice.default.title')}
            value={binding?.providerId ?? NONE}
            disabled={busy || actions.setVoiceDefault === undefined}
            options={[
              { value: NONE, label: t('voice.default.none') },
              ...providers.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
            onChange={(next) => setDefault(kind, next === NONE ? null : next)}
          />
        }
      >
        {provider === undefined || kind === 'asr' ? null : (
          <>
            <ChoiceField
              label={t('voice.default.voice')}
              customLabel={t('voice.provider.voiceCustom')}
              values={[PROVIDER_VOICE, ...voices.map((voice) => voice.id)]}
              names={{
                [PROVIDER_VOICE]: provider.defaultVoice
                  ? `${t('voice.default.providerVoice')} · ${provider.defaultVoice}`
                  : t('voice.default.providerVoice'),
                ...Object.fromEntries(voices.map((voice) => [voice.id, voice.name])),
              }}
              state={voiceState}
              placeholder={provider.defaultVoice}
              t={t}
              onChange={(next) => {
                if (next.choice === CUSTOM_CHOICE) {
                  setVoiceEdit(next);
                  return;
                }
                setDefault(
                  'tts',
                  provider.id,
                  next.choice === PROVIDER_VOICE ? undefined : next.choice,
                );
              }}
            />
            {voiceState.choice === CUSTOM_CHOICE ? (
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
            ) : null}
          </>
        )}
        {failure === undefined ? null : <Note tone="danger">{failure}</Note>}
      </SettingsRow>
    );
  };
  const section = (kind: Kind): ReactElement => {
    const title = kind === 'tts' ? t('voice.providers.title') : t('voice.asr.title');
    const providers = view === undefined ? [] : providersOf(view, kind);
    return (
      <SettingsSection
        title={title}
        description={kind === 'tts' ? t('voice.providers.description') : t('voice.asr.description')}
      >
        {view === undefined ? null : defaultRow(view, kind)}
        <SettingsRow
          title={kind === 'tts' ? t('voice.providers.new') : t('voice.asr.new')}
          description={
            view !== undefined && providers.length === 0
              ? kind === 'tts'
                ? t('voice.providers.empty')
                : t('voice.asr.empty')
              : undefined
          }
          data={{ 'data-voice-provider-new': kind }}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={view === undefined}
              onClick={() => {
                if (view === undefined) return;
                setError(undefined);
                setDraft(emptyDraft(kind, presetsOf(view, kind)[0]));
              }}
            >
              {t('voice.providers.add')}
            </Button>
          }
        />
        {view === undefined ? (
          loadError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={title} />
          ) : (
            <Note tone="danger">{loadError}</Note>
          )
        ) : (
          providers.map((provider) => {
            const state = health[provider.id];
            const presetName =
              presetsOf(view, kind).find((entry) => entry.id === provider.preset)?.name ??
              provider.preset;
            return (
              <SettingsRow
                key={provider.id}
                title={provider.name}
                data={{ 'data-voice-provider': provider.id }}
                description={[
                  presetName,
                  provider.baseUrl,
                  provider.keySet ? t('voice.provider.keySet') : t('voice.provider.noKey'),
                ].join(' · ')}
                control={
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={state === 'testing'}
                      onClick={() => test(provider)}
                    >
                      {t('voice.provider.test')}
                    </Button>
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
                {state === undefined ? null : state === 'testing' ? (
                  <Note tone="muted">{t('voice.provider.testing')}</Note>
                ) : (
                  <Note tone={state.ok ? 'success' : 'danger'}>{healthText(t, state)}</Note>
                )}
              </SettingsRow>
            );
          })
        )}
      </SettingsSection>
    );
  };
  const needsUrl = draft !== undefined && preset?.baseUrl === undefined;
  const needsKey = preset?.keyRequired === true;
  const suggestedName =
    draft === undefined || view === undefined
      ? undefined
      : defaultProviderName(preset?.name ?? draft.preset, [
          ...view.providers,
          ...view.asrProviders,
        ]);
  return (
    <div ref={mount} data-voice-providers="" {...stylex.props(styles.page)}>
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
            <Select
              label={t('voice.provider.preset')}
              value={draft.preset}
              options={presetsOf(view, draft.kind).map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
              onChange={(next) =>
                setDraft(
                  emptyDraft(
                    draft.kind,
                    presetsOf(view, draft.kind).find((entry) => entry.id === next),
                  ),
                )
              }
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
              t={t}
              onChange={(model) => setDraft({ ...draft, model })}
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
                t={t}
                onChange={(voice) => setDraft({ ...draft, voice })}
              />
            ) : null}
            <TextField
              label={needsKey ? t('voice.provider.key') : t('voice.provider.keyOptional')}
              hint={t('voice.provider.keyHint')}
              value={draft.key}
              type="password"
              monospace
              spellCheck={false}
              autoComplete="off"
              onChange={(key) => setDraft({ ...draft, key })}
            />
          </FieldStack>
        </FormDialog>
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

export function BotVoiceSettings({
  actions,
  slug,
  t,
}: {
  actions: VoiceActions;
  slug: string;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [view, setView] = useState<VoiceProvidersView>();
  const [loadError, setLoadError] = useState<string>();
  const [voiceId, setVoiceId] = useState('');
  const [sample, setSample] = useState(() => t('voice.bot.sampleText'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreview, previewMount] = usePreviewUrl();
  const mount = useMountedResource<HTMLDivElement>(() => {
    void actions
      .voiceProviders?.(slug)
      .then((next) => {
        setView(next);
        setVoiceId(next.bot?.selected?.voiceId ?? '');
      })
      .catch((cause: unknown) => setLoadError(errorMessage(cause)));
  }, [actions, slug]);
  if (actions.voiceProviders === undefined || actions.setBotVoice === undefined) return null;
  const setBotVoice = actions.setBotVoice;
  const selected = view?.bot?.selected ?? null;
  const asr = view?.bot?.asr ?? null;
  const provider = view?.providers.find((entry) => entry.id === selected?.providerId);
  const defaultTts = view?.providers.find((entry) => entry.id === view.defaults.tts?.providerId);
  const defaultAsr = view?.asrProviders.find((entry) => entry.id === view.defaults.asr?.providerId);
  const follow = (name: string | undefined) =>
    name === undefined ? t('voice.bot.followNone') : t('voice.bot.follow', { name });
  const bindAsr = (providerId: string | null): void => {
    if (actions.setBotAsr === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    void actions
      .setBotAsr(slug, providerId)
      .then((next) => {
        setView((current) =>
          current === undefined
            ? current
            : {
                ...current,
                bot: { slug, selected: current.bot?.selected ?? null, asr: next },
              },
        );
        setSaved(true);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const bind = (providerId: string | null, voice: string): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    void setBotVoice(slug, providerId, voice.trim() || undefined)
      .then((next) => {
        setView((current) =>
          current === undefined
            ? current
            : { ...current, bot: { slug, selected: next, asr: current.bot?.asr ?? null } },
        );
        setVoiceId(next?.voiceId ?? '');
        setSaved(true);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const preview = (): void => {
    if (actions.synthesizeVoice === undefined || busy || !sample.trim()) return;
    setBusy(true);
    setError(undefined);
    void actions
      .synthesizeVoice({
        text: sample,
        slug,
        ...(voiceId.trim() ? { voiceId: voiceId.trim() } : {}),
      })
      .then((result) => setPreview(result.audio, result.mime))
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  if (view === undefined)
    return (
      <div ref={mount}>
        {loadError === undefined ? (
          <LoadingSkeleton kind="sidebar" label={t('voice.bot.title')} />
        ) : (
          <Note tone="danger">{loadError}</Note>
        )}
      </div>
    );
  return (
    <div ref={mount} data-bot-voice={slug}>
      <SettingsSection title={t('voice.bot.title')} description={t('voice.bot.description')}>
        <SettingsRow
          title={t('voice.bot.provider')}
          data={{ 'data-bot-voice-provider': '' }}
          description={
            view.providers.length === 0 ? t('voice.bot.noProviders') : t('voice.bot.providerHint')
          }
          control={
            <Select
              label={t('voice.bot.provider')}
              value={selected?.providerId ?? FOLLOW}
              disabled={busy}
              options={[
                { value: FOLLOW, label: follow(defaultTts?.name) },
                ...view.providers.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                })),
              ]}
              onChange={(next) => bind(next === FOLLOW ? null : next, '')}
            />
          }
        />
        <SettingsRow
          title={t('voice.bot.asr')}
          data={{ 'data-bot-voice-asr': '' }}
          description={
            view.asrProviders.length === 0 ? t('voice.bot.noProviders') : t('voice.bot.asrHint')
          }
          control={
            <Select
              label={t('voice.bot.asr')}
              value={asr?.providerId ?? FOLLOW}
              disabled={busy || actions.setBotAsr === undefined}
              options={[
                { value: FOLLOW, label: follow(defaultAsr?.name) },
                ...view.asrProviders.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                })),
              ]}
              onChange={(next) => bindAsr(next === FOLLOW ? null : next)}
            />
          }
        />
        {selected === null ? null : (
          <SettingsRow
            title={t('voice.bot.voiceId')}
            data={{ 'data-bot-voice-id': '' }}
            description={t('voice.bot.voiceIdHint', {
              fallback: provider?.defaultVoice ?? t('voice.bot.providerDefault'),
            })}
          >
            <TextField
              label={t('voice.bot.voiceIdField')}
              value={voiceId}
              monospace
              spellCheck={false}
              autoComplete="off"
              placeholder={provider?.defaultVoice}
              onChange={setVoiceId}
            />
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || voiceId.trim() === (selected.voiceId ?? '')}
                onClick={() => bind(selected.providerId, voiceId)}
              >
                {t('voice.bot.save')}
              </Button>
            </span>
          </SettingsRow>
        )}
        {selected === null && defaultTts === undefined ? null : (
          <SettingsRow
            title={t('voice.bot.preview')}
            data={{ 'data-bot-voice-preview': '' }}
            description={t('voice.bot.previewHint')}
          >
            <TextAreaField
              label={t('voice.bot.sample')}
              value={sample}
              rows={2}
              onChange={setSample}
            />
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !sample.trim()}
                onClick={preview}
              >
                {t('voice.bot.previewAction')}
              </Button>
            </span>
            {previewUrl === undefined ? null : (
              <div className="bh-message-voice" ref={previewMount}>
                <MessageAudio name={t('message.voice.label')} url={previewUrl} t={t} />
              </div>
            )}
          </SettingsRow>
        )}
        {saved && error === undefined ? <Tag tone="neutral">{t('voice.bot.saved')}</Tag> : null}
        {error === undefined ? null : <Note tone="danger">{error}</Note>}
      </SettingsSection>
    </div>
  );
}

export function BotVoiceSettingsEntry({
  botSlug,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement | null {
  if (botSlug === undefined) return null;
  return <BotVoiceSettings actions={actions} slug={botSlug} t={t} />;
}
