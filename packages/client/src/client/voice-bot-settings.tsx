import { useState, type ReactElement, type RefCallback } from 'react';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { errorMessage } from './bridge.js';
import { Button } from './ds/button.js';
import { TextAreaField, TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { Tag } from './ds/tag.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { MessageAudio } from './message-audio.js';
import { useMountedResource } from './mounted-resource.js';
import type { VoiceActions } from './voice-settings.js';
import type { VoiceProvidersView } from './voice-bridge.js';

const FOLLOW = 'follow';

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
                bot: {
                  slug,
                  selected: current.bot?.selected ?? null,
                  asr: next,
                },
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
            : {
                ...current,
                bot: { slug, selected: next, asr: current.bot?.asr ?? null },
              },
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
