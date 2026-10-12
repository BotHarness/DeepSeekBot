import { useId, useState, type CSSProperties, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import {
  normalizeSourceColor,
  resolveBotPrimaryColor,
  type BotPrimaryColor,
} from '../../../core/src/bots/primary-color.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import {
  botNameColor,
  botPresentationSubject,
  REFERENCE_SURFACES,
  type ThemeName,
} from './bot-primary-color.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import type { BotSummary, ChannelSummary } from './store.js';

export const PRIMARY_COLOR_PRESETS = [
  '#d9475a',
  '#e07a3f',
  '#c79a2b',
  '#3f9e6b',
  '#3f8fd0',
  '#8a63d2',
  '#1d1b22',
  '#9aa3ad',
  '#f4f1ec',
] as const;

type Draft = { mode: 'automatic' } | { mode: 'custom'; color: string };

function draftOf(policy: BotPrimaryColor | undefined): Draft {
  return policy?.mode === 'custom'
    ? { mode: 'custom', color: policy.color }
    : { mode: 'automatic' };
}

function PreviewPane({
  theme,
  bot,
  source,
  t,
}: {
  theme: ThemeName;
  bot: BotSummary;
  source: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const reference = REFERENCE_SURFACES[theme];
  const name = botNameColor(source, reference.background);
  return (
    <div
      className="bh-primary-color-pane"
      data-preview-theme={theme}
      data-name-color={name}
      style={
        {
          '--bh-primary-preview-surface': reference.background,
          '--bh-primary-preview-label': reference.label,
          '--bh-primary-preview-name': name,
          '--bh-primary-preview-swatch': source,
        } as CSSProperties
      }
    >
      <span className="bh-primary-color-pane-title">{t(`profile.primaryColor.${theme}`)}</span>
      <div className="bh-primary-color-sample">
        <PersonaBotAvatar
          t={t}
          personaBotId={bot.slug}
          name={bot.displayName}
          src={bot.avatar}
          appearance={bot.appearance}
          avatarSeed={bot.avatarSeed}
          size={28}
          indicator={false}
          still
        />
        <div className="bh-primary-color-sample-copy">
          <span className="bh-primary-color-author" data-preview="author">
            {bot.displayName}
          </span>
          <span className="bh-primary-color-line">
            <span className="bh-primary-color-mention" data-preview="mention">
              @{bot.displayName}
            </span>
            {t('profile.primaryColor.sampleText')}
          </span>
        </div>
      </div>
      <span className="bh-primary-color-chart" data-preview="chart">
        <span className="bh-primary-color-chart-swatch" aria-hidden="true" />
        {t('profile.primaryColor.chart')}
      </span>
    </div>
  );
}

export function PrimaryColorModal({
  bot,
  channel,
  actions,
  t,
  onClose,
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  actions: Pick<BridgeActions, 'setBotPrimaryColor'>;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const subject = botPresentationSubject(bot);
  const { primaryColor: _saved, ...unset } = subject;
  const automatic = resolveBotPrimaryColor(unset);
  const saved = resolveBotPrimaryColor(subject);
  const [draft, setDraft] = useState<Draft>(() => draftOf(bot.primaryColor));
  const [hex, setHex] = useState(saved.color);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hexId = useId();
  const source = draft.mode === 'custom' ? draft.color : automatic.color;
  const typed = normalizeSourceColor(hex);
  const invalid = draft.mode === 'custom' && typed === undefined;
  const unchanged =
    draft.mode === saved.mode && (draft.mode === 'automatic' || draft.color === saved.color);

  const pick = (color: string): void => {
    setDraft({ mode: 'custom', color });
    setHex(color);
    setFailed(false);
  };
  const choose = (mode: Draft['mode']): void => {
    setFailed(false);
    if (mode === 'automatic') {
      setDraft({ mode: 'automatic' });
      return;
    }
    const color = typed ?? source;
    setDraft({ mode: 'custom', color });
    setHex(color);
  };
  const save = async (): Promise<void> => {
    if (invalid) return;
    if (unchanged) {
      onClose();
      return;
    }
    setBusy(true);
    setFailed(false);
    const ok = await actions.setBotPrimaryColor(
      channel.id,
      draft.mode === 'custom' ? { mode: 'custom', color: draft.color } : { mode: 'automatic' },
    );
    setBusy(false);
    if (ok) onClose();
    else setFailed(true);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('profile.primaryColor.title')}
      closeLabel={t('common.close')}
      className="bh-sidebar-modal bh-primary-color-modal"
      footer={
        <div className="bh-modal-footer">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy || invalid} onClick={() => void save()}>
            {t('profile.save')}
          </Button>
        </div>
      }
    >
      <div className="bh-primary-color-editor" data-primary-color-mode={draft.mode}>
        <div
          className="bh-avatar-families"
          role="radiogroup"
          aria-label={t('profile.primaryColor.mode')}
        >
          {(['automatic', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              data-primary-color-choice={mode}
              aria-checked={draft.mode === mode}
              disabled={busy}
              onClick={() => choose(mode)}
            >
              {t(`profile.primaryColor.${mode}`)}
            </button>
          ))}
        </div>
        {draft.mode === 'automatic' ? (
          <p className="bh-personabot-hint" data-primary-color-source={automatic.source}>
            {t(
              automatic.source === 'hair'
                ? 'profile.primaryColor.source.hair'
                : 'profile.primaryColor.source.fallback',
            )}
          </p>
        ) : (
          <div className="bh-primary-color-custom">
            <div
              className="bh-avatar-color-row"
              role="group"
              aria-label={t('profile.primaryColor.presets')}
            >
              {PRIMARY_COLOR_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="bh-avatar-swatch"
                  data-primary-color-preset={value}
                  aria-pressed={draft.color === value}
                  aria-label={`${t('profile.primaryColor.presets')} ${value}`}
                  disabled={busy}
                  style={{ background: value }}
                  onClick={() => pick(value)}
                />
              ))}
              <input
                type="color"
                aria-label={t('profile.primaryColor.picker')}
                value={draft.color}
                disabled={busy}
                onChange={(event) => pick(event.currentTarget.value.toLowerCase())}
              />
            </div>
            <div className="bh-primary-color-hex">
              <label className="bh-personabot-label" htmlFor={hexId}>
                {t('profile.primaryColor.hex')}
              </label>
              <input
                id={hexId}
                className="bh-primary-color-hex-input"
                value={hex}
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
                maxLength={7}
                aria-invalid={invalid}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setHex(value);
                  setFailed(false);
                  const color = normalizeSourceColor(value);
                  if (color !== undefined) setDraft({ mode: 'custom', color });
                }}
              />
              {invalid ? (
                <span className="bh-personabot-hint" data-invalid="true">
                  {t('profile.primaryColor.hexInvalid')}
                </span>
              ) : null}
            </div>
            <p className="bh-personabot-hint">{t('profile.primaryColor.customHint')}</p>
          </div>
        )}
        <div className="bh-primary-color-preview" aria-label={t('profile.primaryColor.preview')}>
          <PreviewPane theme="light" bot={bot} source={source} t={t} />
          <PreviewPane theme="dark" bot={bot} source={source} t={t} />
        </div>
        <p className="bh-personabot-hint">{t('profile.primaryColor.previewHint')}</p>
        {failed ? (
          <div className="bh-error" role="alert">
            {t('profile.primaryColor.failed')}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
