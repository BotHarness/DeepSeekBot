import {
  BUBBLE_SURFACES,
  contrastRatio,
  parseColor,
  readable,
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
    return { ...tokens, ...TOBS_ACCENT_ROLES[preset][mode] };
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
