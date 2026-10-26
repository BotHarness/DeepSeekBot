import type { CSSProperties, ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  APPEARANCE_PRIMARY,
  type Appearance,
  type AppearanceConfig,
  type AppearanceMode,
  type AppearanceModeConfig,
  type AppearancePreference,
  type AppearancePreset,
} from './appearance.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { LayoutMode } from './layout-mode.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';

export const APPEARANCE_PRESETS: readonly { id: AppearancePreset; label: BotHarnessKey }[] = [
  { id: 'classic-blue', label: 'appearance.classicBlue' },
  { id: 'mist-purple', label: 'appearance.mistPurple' },
  { id: 'forest-green', label: 'appearance.forestGreen' },
  { id: 'warm-amber', label: 'appearance.warmAmber' },
];

const SCHEMES: readonly { id: AppearancePreference; label: BotHarnessKey }[] = [
  { id: 'system', label: 'settings.theme.system' },
  { id: 'light', label: 'settings.theme.light' },
  { id: 'dark', label: 'settings.theme.dark' },
];

const ink = {
  lightBase: 'oklch(0.975 0.004 250)',
  lightSide: 'oklch(0.93 0.012 250)',
  lightLine: 'oklch(0.87 0.012 250)',
  lightCard: 'oklch(0.995 0 0)',
  darkBase: 'oklch(0.235 0.014 255)',
  darkSide: 'oklch(0.285 0.02 255)',
  darkLine: 'oklch(0.39 0.02 255)',
  darkCard: 'oklch(0.265 0.016 255)',
} as const;

const styles = stylex.create({
  grid: {
    display: 'grid',
    gap: space.x3,
    gridTemplateColumns: 'repeat(3, minmax(0, 148px))',
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    padding: space.x2,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: { default: color.border, ':hover': color.borderStrong },
    borderRadius: radius.md,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '2px',
    transitionProperty: 'border-color, background-color',
    transitionDuration: '120ms',
  },
  checked: {
    borderColor: { default: color.accent, ':hover': color.accent },
    backgroundColor: { default: color.accentTint, ':hover': color.accentTint },
    color: color.fg,
    fontWeight: text.strong,
  },
  preview: {
    position: 'relative',
    display: 'block',
    aspectRatio: '16 / 10',
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
  },
  layer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
  },
  darkHalf: { clipPath: 'inset(0 0 0 50%)' },
  side: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    width: '28%',
    padding: space.x2,
  },
  main: {
    position: 'relative',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: space.x3,
  },
  bar: { height: '5px', borderRadius: radius.xs },
  composer: {
    position: 'absolute',
    insetInline: '8px',
    bottom: '7px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '12px',
    paddingInline: space.x1,
    borderRadius: radius.xs,
    borderWidth: border.hairline,
    borderStyle: 'solid',
  },
  dot: { width: '7px', height: '7px', borderRadius: radius.round, cornerShape: 'round' },
  presets: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    paddingBlock: space.x2,
    paddingInlineStart: space.x2,
    paddingInlineEnd: space.x4,
    borderRadius: radius.lg,
    textAlign: 'start',
  },
  morph: {
    display: 'block',
    flexShrink: 0,
    width: '20px',
    height: '20px',
    borderRadius: radius.round,
    cornerShape: 'round',
    boxShadow: `inset 0 0 0 1px ${color.divider}`,
  },
  name: {},
  layoutFrame: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    gap: '3px',
    padding: '4px',
    backgroundColor: color.base,
  },
  layoutColumn: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
  layoutRail: {
    width: '9%',
    flexShrink: 0,
    borderRadius: radius.xs,
    backgroundColor: color.divider,
  },
  layoutPane: {
    flexGrow: 1,
    minWidth: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
    borderRadius: radius.xs,
    backgroundColor: color.surface,
  },
  layoutActive: { borderColor: color.accent },
  swatchRow: { display: 'inline-flex', alignItems: 'center', gap: space.x2, color: color.muted },
  swatch: {
    position: 'relative',
    display: 'inline-flex',
    width: '24px',
    height: '24px',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.round,
    cornerShape: 'round',
    boxShadow: { default: 'none', ':focus-within': `0 0 0 2px ${color.accent}` },
    cursor: 'pointer',
  },
  input: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    margin: 0,
    padding: 0,
    opacity: 0,
    cursor: 'pointer',
  },
});

const morph = (light: string, dark: string): CSSProperties => ({
  backgroundImage: `linear-gradient(135deg, ${light} 0%, color-mix(in oklab, ${light}, ${dark}) 50%, ${dark} 100%)`,
});

function MiniWindow({ mode, primary }: { mode: AppearanceMode; primary: string }): ReactElement {
  const light = mode === 'light';
  const base = light ? ink.lightBase : ink.darkBase;
  const line = light ? ink.lightLine : ink.darkLine;
  return (
    <span {...stylex.props(styles.layer)} style={{ backgroundColor: base }}>
      <span
        {...stylex.props(styles.side)}
        style={{ backgroundColor: light ? ink.lightSide : ink.darkSide }}
      >
        {[0, 1, 2].map((key) => (
          <span key={key} {...stylex.props(styles.bar)} style={{ backgroundColor: line }} />
        ))}
      </span>
      <span {...stylex.props(styles.main)}>
        <span
          {...stylex.props(styles.bar)}
          style={{
            width: '34%',
            alignSelf: 'flex-end',
            backgroundColor: `color-mix(in srgb, ${primary} 35%, transparent)`,
          }}
        />
        <span {...stylex.props(styles.bar)} style={{ width: '70%', backgroundColor: line }} />
        <span {...stylex.props(styles.bar)} style={{ width: '50%', backgroundColor: line }} />
        <span
          {...stylex.props(styles.composer)}
          style={{ borderColor: line, backgroundColor: light ? ink.lightCard : ink.darkCard }}
        >
          <span {...stylex.props(styles.dot)} style={{ backgroundColor: primary }} />
        </span>
      </span>
    </span>
  );
}

const primaryOf = (config: AppearanceConfig, mode: AppearanceMode) =>
  config.modes[mode].primary ?? APPEARANCE_PRIMARY[config.modes[mode].preset][mode];

export function ColorSchemePicker({
  value,
  config,
  onChange,
  t,
}: {
  value: AppearancePreference;
  config: AppearanceConfig;
  onChange: (value: AppearancePreference) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div role="radiogroup" aria-label={t('settings.theme')} {...stylex.props(styles.grid)}>
      {SCHEMES.map((scheme) => {
        const checked = value === scheme.id;
        return (
          <button
            key={scheme.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(scheme.id)}
            {...stylex.props(styles.card, checked && styles.checked)}
          >
            <span {...stylex.props(styles.preview)} aria-hidden="true">
              {scheme.id !== 'dark' ? (
                <MiniWindow mode="light" primary={primaryOf(config, 'light')} />
              ) : null}
              {scheme.id !== 'light' ? (
                <span {...stylex.props(styles.layer, scheme.id === 'system' && styles.darkHalf)}>
                  <MiniWindow mode="dark" primary={primaryOf(config, 'dark')} />
                </span>
              ) : null}
            </span>
            {t(scheme.label)}
          </button>
        );
      })}
    </div>
  );
}

export function ThemePresetPicker({
  config,
  onSelect,
  t,
}: {
  config: AppearanceConfig;
  onSelect: (preset: AppearancePreset) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div role="radiogroup" aria-label={t('appearance.palette')} {...stylex.props(styles.presets)}>
      {APPEARANCE_PRESETS.map((preset) => {
        const checked =
          config.modes.light.preset === preset.id && config.modes.dark.preset === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onSelect(preset.id)}
            {...stylex.props(styles.card, styles.chip, checked && styles.checked)}
          >
            <span
              aria-hidden="true"
              {...stylex.props(styles.morph)}
              style={morph(APPEARANCE_PRIMARY[preset.id].light, APPEARANCE_PRIMARY[preset.id].dark)}
            />
            <span {...stylex.props(styles.name)}>{t(preset.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function applyPreset(appearance: Appearance, preset: AppearancePreset): void {
  for (const mode of ['light', 'dark'] as const) {
    try {
      appearance.update({ mode, preset });
    } catch {}
  }
}

export function PrimaryColorPicker({
  mode,
  config,
  onChange,
  t,
}: {
  mode: AppearanceMode;
  config: AppearanceModeConfig;
  onChange: (primary: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const primary = config.primary ?? APPEARANCE_PRIMARY[config.preset][mode];
  return (
    <span {...stylex.props(styles.swatchRow)}>
      <ChannelSidebarIcon name={mode === 'light' ? 'sun' : 'moon'} size={14} />
      <span {...stylex.props(styles.swatch)} style={{ backgroundColor: primary }}>
        <input
          type="color"
          aria-label={t(mode === 'light' ? 'appearance.lightPrimary' : 'appearance.darkPrimary')}
          value={primary}
          onChange={(event) => onChange(event.currentTarget.value)}
          {...stylex.props(styles.input)}
        />
      </span>
    </span>
  );
}

const LAYOUT_MODES: readonly { id: LayoutMode; label: BotHarnessKey }[] = [
  { id: 'simple', label: 'workspace.layoutMode.simple' },
  { id: 'advanced', label: 'workspace.layoutMode.advanced' },
];

function LayoutPreview({ mode }: { mode: LayoutMode }): ReactElement {
  const pane = (grow: number, active = false) => (
    <span
      {...stylex.props(styles.layoutPane, active && styles.layoutActive)}
      style={{ flexGrow: grow }}
    />
  );
  return (
    <span {...stylex.props(styles.layoutFrame)}>
      <span {...stylex.props(styles.layoutRail)} />
      {mode === 'simple' ? (
        <>
          {pane(1)}
          {pane(2.4, true)}
        </>
      ) : (
        <>
          <span {...stylex.props(styles.layoutColumn)} style={{ flexGrow: 1 }}>
            {pane(1)}
            {pane(1.4)}
          </span>
          {pane(1.6, true)}
          <span {...stylex.props(styles.layoutColumn)} style={{ flexGrow: 1 }}>
            {pane(1.2)}
            {pane(1)}
          </span>
        </>
      )}
    </span>
  );
}

export function LayoutModePicker({
  value,
  onChange,
  t,
}: {
  value: LayoutMode;
  onChange: (value: LayoutMode) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div role="radiogroup" aria-label={t('workspace.layoutMode')} {...stylex.props(styles.grid)}>
      {LAYOUT_MODES.map((mode) => {
        const checked = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={checked}
            data-layout-mode={mode.id}
            onClick={() => onChange(mode.id)}
            {...stylex.props(styles.card, checked && styles.checked)}
          >
            <span {...stylex.props(styles.preview)} aria-hidden="true">
              <LayoutPreview mode={mode.id} />
            </span>
            {t(mode.label)}
          </button>
        );
      })}
    </div>
  );
}
