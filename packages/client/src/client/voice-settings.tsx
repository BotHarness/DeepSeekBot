import { useState, type ReactElement, type RefCallback } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { errorMessage } from './bridge.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { MessageAudio } from './message-audio.js';
import { useMountedResource } from './mounted-resource.js';
import type {
  VoicePresetView,
  VoiceProviderHealthView,
  VoiceProvidersView,
  VoiceProviderView,
} from './voice-bridge.js';

type VoiceActions = Pick<
  BridgeActions,
  | 'voiceProviders'
  | 'addVoiceProvider'
  | 'removeVoiceProvider'
  | 'testVoiceProvider'
  | 'synthesizeVoice'
  | 'setBotVoice'
>;

const NONE = 'none';

interface Draft {
  preset: string;
  name: string;
  baseUrl: string;
  model: string;
  voice: string;
  key: string;
}

function emptyDraft(preset: VoicePresetView | undefined): Draft {
  return {
    preset: preset?.id ?? 'custom',
    name: '',
    baseUrl: '',
    model: '',
    voice: '',
    key: '',
  };
}

function healthText(t: BotHarnessTranslate, health: VoiceProviderHealthView): string {
  return health.ok
    ? t('voice.provider.healthy', { ms: health.latencyMs })
    : t('voice.provider.unhealthy', { reason: health.message });
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
  const [removing, setRemoving] = useState<VoiceProviderView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
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
  const preset = view?.presets.find((entry) => entry.id === draft?.preset);
  const test = (provider: VoiceProviderView): void => {
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
    setBusy(true);
    setError(undefined);
    void add({
      preset: draft.preset,
      ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
      ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
      ...(draft.model.trim() ? { model: draft.model.trim() } : {}),
      ...(draft.voice.trim() ? { defaultVoice: draft.voice.trim() } : {}),
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
  const remove = (provider: VoiceProviderView): void => {
    if (actions.removeVoiceProvider === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void actions
      .removeVoiceProvider(provider.id)
      .then(() => {
        setRemoving(undefined);
        load();
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const needsUrl = draft !== undefined && preset?.baseUrl === undefined;
  const needsKey = preset?.keyRequired === true;
  return (
    <div ref={mount} data-voice-providers="">
      <SettingsSection
        title={t('voice.providers.title')}
        description={t('voice.providers.description')}
      >
        <SettingsRow
          title={t('voice.providers.new')}
          data={{ 'data-voice-provider-new': '' }}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={view === undefined}
              onClick={() => {
                setError(undefined);
                setDraft(emptyDraft(view?.presets[0]));
              }}
            >
              {t('voice.providers.add')}
            </Button>
          }
        />
        {view === undefined ? (
          loadError === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('voice.providers.title')} />
          ) : (
            <Note tone="danger">{loadError}</Note>
          )
        ) : (
          view.providers.map((provider) => {
            const state = health[provider.id];
            const presetName =
              view.presets.find((entry) => entry.id === provider.preset)?.name ?? provider.preset;
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
        {view !== undefined && view.providers.length === 0 ? (
          <Note tone="muted">{t('voice.providers.empty')}</Note>
        ) : null}
        {error === undefined || draft !== undefined || removing !== undefined ? null : (
          <Note tone="danger">{error}</Note>
        )}
      </SettingsSection>
      {draft === undefined || view === undefined ? null : (
        <FormDialog
          title={t('voice.providers.addTitle')}
          size="medium"
          scroll
          labels={labels}
          submitLabel={t('voice.providers.addSubmit')}
          submitData={{ 'data-voice-provider-submit': '' }}
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
              options={view.presets.map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
              onChange={(next) => setDraft({ ...emptyDraft(undefined), preset: next })}
            />
            <TextField
              label={t('voice.provider.name')}
              value={draft.name}
              placeholder={preset?.name}
              autoComplete="off"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            {needsUrl ? (
              <TextField
                label={t('voice.provider.baseUrl')}
                hint={t('voice.provider.baseUrlHint')}
                value={draft.baseUrl}
                monospace
                spellCheck={false}
                autoComplete="off"
                placeholder="http://127.0.0.1:8880/v1"
                onChange={(baseUrl) => setDraft({ ...draft, baseUrl })}
              />
            ) : null}
            <TextField
              label={t('voice.provider.model')}
              value={draft.model}
              monospace
              spellCheck={false}
              autoComplete="off"
              placeholder={preset?.defaultModel}
              onChange={(model) => setDraft({ ...draft, model })}
            />
            <TextField
              label={t('voice.provider.voice')}
              hint={t('voice.provider.voiceHint')}
              value={draft.voice}
              monospace
              spellCheck={false}
              autoComplete="off"
              placeholder={preset?.defaultVoice}
              onChange={(voice) => setDraft({ ...draft, voice })}
            />
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
  const provider = view?.providers.find((entry) => entry.id === selected?.providerId);
  const bind = (providerId: string | null, voice: string): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    void setBotVoice(slug, providerId, voice.trim() || undefined)
      .then((next) => {
        setView((current) =>
          current === undefined ? current : { ...current, bot: { slug, selected: next } },
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
              value={selected?.providerId ?? NONE}
              disabled={busy}
              options={[
                { value: NONE, label: t('voice.bot.off') },
                ...view.providers.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                })),
              ]}
              onChange={(next) => bind(next === NONE ? null : next, '')}
            />
          }
        />
        {selected === null ? null : (
          <>
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
          </>
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
