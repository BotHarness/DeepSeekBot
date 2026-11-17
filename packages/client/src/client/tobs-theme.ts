import {
  BUBBLE_SURFACES,
  contrastRatio,
  parseColor,
  readable,
  toHex,
} from '@botharness/host-client/shared/bot-name-color';
import type { AppearanceMode, AppearancePreset } from './appearance.js';
import {
  TOBS_ACCENT_ROLES,
  TOBS_ACCENTS,
  TOBS_STYLES,
  TOBS_TOKENS,
} from './ds/tobs-tokens.generated.js';

export type TobsStyle = keyof typeof TOBS_STYLES;

export function tobsTokens(
  mode: AppearanceMode,
  preset: AppearancePreset,
  primary?: string,
  style: TobsStyle = 'a',
): Record<string, string> {
  const tokens: Record<string, string> = {
    ...TOBS_TOKENS[mode],
    ...TOBS_STYLES[style],
  };
  if (primary === undefined || primary === TOBS_ACCENTS[preset][mode])
    return tone({ ...tokens, ...TOBS_ACCENT_ROLES[preset][mode] }, mode, style);
  const t = TOBS_TOKENS[mode];
  const canvas = t['--tobs-layer-canvas'];
  const shade = mode === 'dark' ? '#ffffff' : '#000000';
  const tint = `color-mix(in srgb, ${primary} ${mode === 'dark' ? 18 : 10}%, ${canvas})`;
  const container = `color-mix(in srgb, ${primary} ${mode === 'dark' ? 30 : 18}%, ${canvas})`;
  const ink = readable(primary, BUBBLE_SURFACES[mode].surface, 4.6);
  const focus = readable(
    primary,
    t[mode === 'dark' ? '--tobs-layer-elevated' : '--tobs-layer-well'],
    3,
  );
  Object.assign(tokens, {
    '--tobs-accent-solid': primary,
    '--tobs-accent-on-solid': onSolid(primary, t['--tobs-accent-on-solid']),
    '--tobs-accent-solid-hover': `color-mix(in srgb, ${primary} 86%, ${shade})`,
    '--tobs-accent-container': container,
    '--tobs-accent-on-container': ink,
    '--tobs-accent-tint': tint,
    '--tobs-accent-ink': ink,
    '--tobs-accent-focus': focus,
    '--tobs-accent-selection': readable(primary, '#ffffff', 4.5),
    '--tobs-line-focus': focus,
    '--tobs-status-info-base': primary,
    '--tobs-status-info-tint': tint,
    '--tobs-status-info-ink': ink,
  });
  return tone(tokens, mode, style);
}

const TONAL: Partial<Record<TobsStyle, Record<AppearanceMode, Record<string, number>>>> = {
  c: {
    light: {
      '--tobs-layer-canvas': 0.03,
      '--tobs-layer-nav': 0.03,
      '--tobs-layer-sheet': 0.03,
      '--tobs-layer-elevated': 0.02,
      '--tobs-layer-raised': 0.06,
      '--tobs-layer-well': 0.09,
      '--tobs-state-selected': 0.12,
      '--tobs-ink-secondary': 0.1,
      '--tobs-ink-tertiary': 0.1,
      '--tobs-ink-quiet': 0.1,
    },
    dark: {
      '--tobs-layer-canvas': 0.04,
      '--tobs-layer-nav': 0.04,
      '--tobs-layer-sheet': 0.04,
      '--tobs-layer-field': 0.03,
      '--tobs-layer-elevated': 0.06,
      '--tobs-layer-raised': 0.07,
      '--tobs-layer-well': 0.09,
      '--tobs-state-selected': 0.16,
      '--tobs-ink-secondary': 0.1,
      '--tobs-ink-tertiary': 0.1,
      '--tobs-ink-quiet': 0.1,
    },
  },
};

function tone(
  tokens: Record<string, string>,
  mode: AppearanceMode,
  style: TobsStyle,
): Record<string, string> {
  const amounts = TONAL[style]?.[mode];
  const seed = parseColor(tokens['--tobs-accent-solid'] ?? '')?.rgb;
  if (amounts === undefined || seed === undefined) return tokens;
  for (const [name, amount] of Object.entries(amounts)) {
    const base = parseColor(tokens[name] ?? '')?.rgb;
    if (base !== undefined)
      tokens[name] = toHex(
        [0, 1, 2].map((i) => seed[i]! * amount + base[i]! * (1 - amount)) as [
          number,
          number,
          number,
        ],
      );
  }
  const surfaces = ['canvas', 'raised', 'well', 'field', 'nav', 'sheet', 'elevated'].map(
    (name) => tokens[`--tobs-layer-${name}`] ?? '',
  );
  for (const [name, minimum] of [
    ['--tobs-ink-secondary', 4.6],
    ['--tobs-ink-tertiary', 4.6],
    ['--tobs-ink-quiet', 3.1],
    ['--tobs-accent-ink', 4.6],
  ] as const)
    for (const surface of surfaces) tokens[name] = readable(tokens[name] ?? '', surface, minimum);
  const alpha = mode === 'dark' ? ['14', '24'] : ['12', '1f'];
  const solid = toHex(seed);
  tokens['--tobs-state-hover'] = `${solid}${alpha[0]}`;
  tokens['--tobs-state-pressed'] = `${solid}${alpha[1]}`;
  return tokens;
}

const LIGHT_ON = '#ffffff';
const DARK_ON = '#0d1220';

function onSolid(primary: string, fallback: string): string {
  const fill = parseColor(primary)?.rgb;
  const light = parseColor(LIGHT_ON)?.rgb;
  const dark = parseColor(DARK_ON)?.rgb;
  if (fill === undefined || light === undefined || dark === undefined) return fallback;
  return contrastRatio(fill, light) >= contrastRatio(fill, dark) ? LIGHT_ON : DARK_ON;
}
