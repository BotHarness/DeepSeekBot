import { BUBBLE_SURFACES, readable } from './bot-name-color.js';
import type { AppearanceMode, AppearancePreset } from './appearance.js';
import { TOBS_ACCENTS, TOBS_TOKENS } from './ds/tobs-tokens.generated.js';

export function tobsTokens(
  mode: AppearanceMode,
  preset: AppearancePreset,
  primary?: string,
): Record<string, string> {
  const tokens: Record<string, string> = { ...TOBS_TOKENS[mode] };
  const base = primary ?? TOBS_ACCENTS[preset][mode];
  if (base === TOBS_ACCENTS['classic-blue'][mode]) return tokens;
  const canvas = TOBS_TOKENS[mode]['--tobs-layer-canvas'];
  tokens['--tobs-accent-base'] = base;
  tokens['--tobs-accent-hover'] =
    `color-mix(in srgb, ${base} 86%, ${mode === 'dark' ? '#ffffff' : '#000000'})`;
  tokens['--tobs-accent-tint'] = `color-mix(in srgb, ${base} 14%, ${canvas})`;
  tokens['--tobs-accent-ink'] = readable(base, BUBBLE_SURFACES[mode].surface, 4.6);
  tokens['--tobs-line-focus'] = base;
  tokens['--tobs-status-info-base'] = base;
  tokens['--tobs-status-info-tint'] = tokens['--tobs-accent-tint'];
  tokens['--tobs-status-info-ink'] = tokens['--tobs-accent-ink'];
  return tokens;
}
