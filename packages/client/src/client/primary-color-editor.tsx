import { useState, type CSSProperties, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

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
import { Field, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
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

const NARROW = '@media (max-width: 480px)';

const styles = stylex.create({
  modes: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    gap: space.x1,
    padding: space.x1,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.row,
  },
  mode: {
    minHeight: size.inlineIcon,
    paddingInline: space.x4,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `2px solid ${color.accent}` },
  },
  modeOn: {
    backgroundColor: { default: color.selected, ':hover': color.selected },
    color: color.fg,
    fontWeight: text.strong,
  },
  swatches: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x3,
  },
  swatch: {
    width: size.inlineIcon,
    height: size.inlineIcon,
    padding: 0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.round,
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `2px solid ${color.accent}` },
    outlineOffset: '2px',
  },
  swatchOn: {
    outline: `2px solid ${color.fg}`,
  },
  picker: {
    width: size.inlineIcon,
    height: size.inlineIcon,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: { default: 'pointer', ':disabled': 'default' },
  },
  preview: {
    display: 'grid',
    gridTemplateColumns: { default: 'repeat(2, minmax(0, 1fr))', [NARROW]: 'minmax(0, 1fr)' },
    gap: space.x3,
  },
  pane: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
    padding: space.x4,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.card,
    backgroundColor: 'var(--bh-primary-preview-surface)',
    color: 'var(--bh-primary-preview-label)',
  },
  paneTitle: { fontSize: text.metaSize, lineHeight: text.metaLine, opacity: 0.6 },
  sample: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.x3,
    minWidth: 0,
  },
  sampleCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
  },
  author: {
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: 'var(--bh-primary-preview-name)',
    overflowWrap: 'anywhere',
  },
  line: { fontSize: text.bodySize, overflowWrap: 'anywhere' },
  mention: {
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderRadius: radius.control,
    backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)',
    color: 'var(--bh-primary-preview-name)',
  },
  chart: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  chartSwatch: {
    width: '28px',
    height: '10px',
    borderRadius: radius.control,
    backgroundColor: 'var(--bh-primary-preview-swatch)',
    boxShadow: '0 0 0 1px color-mix(in srgb, currentColor 18%, transparent)',
  },
});

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
      data-preview-theme={theme}
      data-name-color={name}
      {...stylex.props(styles.pane)}
      style={
        {
          '--bh-primary-preview-surface': reference.background,
          '--bh-primary-preview-label': reference.label,
          '--bh-primary-preview-name': name,
          '--bh-primary-preview-swatch': source,
        } as CSSProperties
      }
    >
      <span {...stylex.props(styles.paneTitle)}>{t(`profile.primaryColor.${theme}`)}</span>
      <div {...stylex.props(styles.sample)}>
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
        <div {...stylex.props(styles.sampleCopy)}>
          <span data-preview="author" {...stylex.props(styles.author)}>
            {bot.displayName}
          </span>
          <span {...stylex.props(styles.line)}>
            <span data-preview="mention" {...stylex.props(styles.mention)}>
              @{bot.displayName}
            </span>
            {t('profile.primaryColor.sampleText')}
          </span>
        </div>
      </div>
      <span data-preview="chart" {...stylex.props(styles.chart)}>
        <span aria-hidden="true" {...stylex.props(styles.chartSwatch)} />
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
    <FormDialog
      title={t('profile.primaryColor.title')}
      size="standard"
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('profile.save')}
      submitDisabled={invalid}
      busy={busy}
      error={failed ? t('profile.primaryColor.failed') : undefined}
      onCancel={onClose}
      onSubmit={() => void save()}
    >
      <Field
        label={t('profile.primaryColor.mode')}
        group
        hint={
          draft.mode === 'automatic' ? (
            <span data-primary-color-source={automatic.source}>
              {t(
                automatic.source === 'hair'
                  ? 'profile.primaryColor.source.hair'
                  : 'profile.primaryColor.source.fallback',
              )}
            </span>
          ) : undefined
        }
      >
        {() => (
          <div
            role="radiogroup"
            aria-label={t('profile.primaryColor.mode')}
            data-primary-color-mode={draft.mode}
            {...stylex.props(styles.modes)}
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
                {...stylex.props(styles.mode, draft.mode === mode && styles.modeOn)}
              >
                {t(`profile.primaryColor.${mode}`)}
              </button>
            ))}
          </div>
        )}
      </Field>
      {draft.mode === 'automatic' ? null : (
        <>
          <Field label={t('profile.primaryColor.presets')} group>
            {() => (
              <div
                role="group"
                aria-label={t('profile.primaryColor.presets')}
                {...stylex.props(styles.swatches)}
              >
                {PRIMARY_COLOR_PRESETS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-primary-color-preset={value}
                    aria-pressed={draft.color === value}
                    aria-label={`${t('profile.primaryColor.presets')} ${value}`}
                    disabled={busy}
                    onClick={() => pick(value)}
                    {...stylex.props(styles.swatch, draft.color === value && styles.swatchOn)}
                    style={{ background: value }}
                  />
                ))}
                <input
                  type="color"
                  aria-label={t('profile.primaryColor.picker')}
                  value={draft.color}
                  disabled={busy}
                  onChange={(event) => pick(event.currentTarget.value.toLowerCase())}
                  {...stylex.props(styles.picker)}
                />
              </div>
            )}
          </Field>
          <TextField
            label={t('profile.primaryColor.hex')}
            hint={t('profile.primaryColor.customHint')}
            error={invalid ? t('profile.primaryColor.hexInvalid') : undefined}
            value={hex}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            onChange={(value) => {
              setHex(value);
              setFailed(false);
              const color = normalizeSourceColor(value);
              if (color !== undefined) setDraft({ mode: 'custom', color });
            }}
          />
        </>
      )}
      <Field
        label={t('profile.primaryColor.preview')}
        group
        hint={t('profile.primaryColor.previewHint')}
      >
        {() => (
          <div {...stylex.props(styles.preview)}>
            <PreviewPane theme="light" bot={bot} source={source} t={t} />
            <PreviewPane theme="dark" bot={bot} source={source} t={t} />
          </div>
        )}
      </Field>
    </FormDialog>
  );
}
