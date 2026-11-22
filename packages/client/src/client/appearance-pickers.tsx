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
  type AppearanceStyle,
  APPEARANCE_STYLES,
} from './appearance.js';
import { ColorInput } from './ds/input.js';
import { Icon } from './ds/icon.js';
import { PreviewChoices, SwatchChoices } from './ds/preview-choice.js';
import { accent, edge, ink, layer, line, radius, space, state, style } from './ds/tobs.stylex.js';
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

const preview = {
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
  fill: (value: string) => ({ backgroundColor: value }),
  composerEdge: (value: string) => ({ boxShadow: `inset 0 0 0 ${edge.hairline} ${value}` }),
  paneGrow: (grow: number) => ({ flexGrow: grow }),
  bubble: { width: '34%', alignSelf: 'flex-end' },
  wideLine: { width: '70%' },
  shortLine: { width: '50%' },
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
  },
  dot: { width: '7px', height: '7px', borderRadius: radius.full, cornerShape: 'round' },
  sample: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 0,
    paddingInline: space.x5,
    backgroundColor: layer.canvas,
  },
  sampleGrouped: { backgroundColor: layer.raised },
  sampleGroup: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sampleCard: { gap: edge.hairline, borderRadius: radius.xs, backgroundColor: line.divider },
  sampleRow: { height: '9px', marginBlock: space.x1, borderRadius: radius.xs },
  sampleRowCard: {
    height: '11px',
    marginBlock: 0,
    borderRadius: 0,
    backgroundColor: layer.elevated,
  },
  sampleRowQuiet: { backgroundColor: layer.raised },
  sampleNeutral: { backgroundColor: state.selected },
  sampleAccent: { backgroundColor: accent.solid },
  sampleTiles: { gap: space.x1, borderRadius: radius.md, backgroundColor: 'transparent' },
  sampleTile: {
    height: '11px',
    marginBlock: 0,
    borderRadius: radius.xs,
    backgroundColor: layer.raised,
  },
  sampleTonal: { backgroundColor: accent.container },

  layoutFrame: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    gap: space.x1,
    padding: space.x2,
    backgroundColor: layer.canvas,
  },
  layoutColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
    flexGrow: 1,
  },
  layoutRail: {
    width: '9%',
    flexShrink: 0,
    borderRadius: radius.xs,
    backgroundColor: line.divider,
  },
  layoutPane: {
    flexGrow: 1,
    minWidth: 0,
    borderRadius: style.radiusContainer,
    backgroundColor: layer.raised,
  },
  layoutActive: { backgroundColor: accent.container },
  swatchRow: { display: 'inline-flex', alignItems: 'center', gap: space.x2, color: ink.secondary },
});

const morph = (light: string, dark: string): CSSProperties => ({
  backgroundImage: `linear-gradient(135deg, ${light} 0%, color-mix(in oklab, ${light}, ${dark}) 50%, ${dark} 100%)`,
});

function MiniWindow({ mode, primary }: { mode: AppearanceMode; primary: string }): ReactElement {
  const light = mode === 'light';
  const base = light ? preview.lightBase : preview.darkBase;
  const bar = light ? preview.lightLine : preview.darkLine;
  return (
    <span {...stylex.props(styles.layer, styles.fill(base))}>
      <span
        {...stylex.props(styles.side, styles.fill(light ? preview.lightSide : preview.darkSide))}
      >
        {[0, 1, 2].map((key) => (
          <span key={key} {...stylex.props(styles.bar, styles.fill(bar))} />
        ))}
      </span>
      <span {...stylex.props(styles.main)}>
        <span
          {...stylex.props(
            styles.bar,
            styles.bubble,
            styles.fill(`color-mix(in srgb, ${primary} 35%, transparent)`),
          )}
        />
        <span {...stylex.props(styles.bar, styles.wideLine, styles.fill(bar))} />
        <span {...stylex.props(styles.bar, styles.shortLine, styles.fill(bar))} />
        <span
          {...stylex.props(
            styles.composer,
            styles.composerEdge(bar),
            styles.fill(light ? preview.lightCard : preview.darkCard),
          )}
        >
          <span {...stylex.props(styles.dot, styles.fill(primary))} />
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
    <PreviewChoices
      label={t('settings.theme')}
      value={value}
      onChange={onChange}
      options={SCHEMES.map((scheme) => ({
        id: scheme.id,
        label: t(scheme.label),
        preview: (
          <>
            {scheme.id !== 'dark' ? (
              <MiniWindow mode="light" primary={primaryOf(config, 'light')} />
            ) : null}
            {scheme.id !== 'light' ? (
              <span {...stylex.props(styles.layer, scheme.id === 'system' && styles.darkHalf)}>
                <MiniWindow mode="dark" primary={primaryOf(config, 'dark')} />
              </span>
            ) : null}
          </>
        ),
      }))}
    />
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
  const light = config.modes.light.preset;
  return (
    <SwatchChoices
      label={t('appearance.palette')}
      value={light === config.modes.dark.preset ? light : undefined}
      onChange={onSelect}
      options={APPEARANCE_PRESETS.map((preset) => ({
        id: preset.id,
        label: t(preset.label),
        swatch: morph(APPEARANCE_PRIMARY[preset.id].light, APPEARANCE_PRIMARY[preset.id].dark),
      }))}
    />
  );
}

const STYLE_LABELS: Record<AppearanceStyle, BotHarnessKey> = {
  a: 'appearance.style.a',
  b: 'appearance.style.b',
  c: 'appearance.style.c',
};

function StyleSample({ id }: { id: AppearanceStyle }): ReactElement {
  const native = id === 'b';
  const tonal = id === 'c';
  return (
    <span {...stylex.props(styles.sample, native && styles.sampleGrouped)}>
      <span {...stylex.props(styles.sampleGroup, tonal ? styles.sampleTiles : styles.sampleCard)}>
        {[0, 1, 2].map((row) => (
          <span
            key={row}
            {...stylex.props(
              styles.sampleRow,
              tonal ? styles.sampleTile : styles.sampleRowCard,
              id === 'a' && styles.sampleRowQuiet,
              row === 0 &&
                (tonal ? styles.sampleTonal : native ? styles.sampleAccent : styles.sampleNeutral),
            )}
          />
        ))}
      </span>
    </span>
  );
}

export function StylePicker({
  value,
  onChange,
  t,
}: {
  value: AppearanceStyle;
  onChange: (value: AppearanceStyle) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <PreviewChoices
      label={t('appearance.style')}
      value={value}
      onChange={onChange}
      options={APPEARANCE_STYLES.map((id) => ({
        id,
        label: t(STYLE_LABELS[id]),
        preview: <StyleSample id={id} />,
      }))}
    />
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
      <Icon name={mode === 'light' ? 'sun' : 'moon'} />
      <ColorInput
        label={t(mode === 'light' ? 'appearance.lightPrimary' : 'appearance.darkPrimary')}
        value={primary}
        onChange={onChange}
      />
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
      {...stylex.props(styles.layoutPane, active && styles.layoutActive, styles.paneGrow(grow))}
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
          <span {...stylex.props(styles.layoutColumn)}>
            {pane(1)}
            {pane(1.4)}
          </span>
          {pane(1.6, true)}
          <span {...stylex.props(styles.layoutColumn)}>
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
    <PreviewChoices
      label={t('workspace.layoutMode')}
      value={value}
      onChange={onChange}
      options={LAYOUT_MODES.map((mode) => ({
        id: mode.id,
        label: t(mode.label),
        preview: <LayoutPreview mode={mode.id} />,
        data: { 'data-layout-mode': mode.id },
      }))}
    />
  );
}
