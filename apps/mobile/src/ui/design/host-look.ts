import {
  contrast,
  headerBand,
  withAccent,
  type ColorRole,
  type ColorScheme,
} from './resolve-theme';

export type HostAvatar =
  | { kind: 'initial' }
  | { kind: 'preset'; id: string }
  | { kind: 'image'; uri: string };

export type HostBanner =
  | { kind: 'accent' }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string }
  | { kind: 'image'; uri: string };

export type HostLook = { avatar: HostAvatar; banner: HostBanner };

export const DEFAULT_HOST_LOOK: HostLook = {
  avatar: { kind: 'initial' },
  banner: { kind: 'accent' },
};

/** Seeds for `seededAvatarFor`: the same pixel portraits PersonaBots get, picked by hand. */
export const HOST_AVATAR_PRESETS = [
  'sora',
  'studio',
  'ren',
  'nova',
  'kai2',
  'nova2',
  'ember',
  'sora2',
] as const;

export const BANNER_COLORS = [
  '#3461c1',
  '#2f80ed',
  '#0f9d8a',
  '#2e9e4f',
  '#e8a317',
  '#e8613c',
  '#d6336c',
  '#8e44ec',
  '#5b5f97',
  '#1f2329',
] as const;

export const BANNER_GRADIENTS = [
  { from: '#4f7cff', to: '#8e44ec' },
  { from: '#ff7a59', to: '#ff3d77' },
  { from: '#12c2e9', to: '#1e6fd9' },
  { from: '#38d39f', to: '#0f8a7e' },
  { from: '#f7b733', to: '#fc4a1a' },
  { from: '#232526', to: '#5b5f97' },
] as const;

export const HEX_PLACEHOLDER = '#3461C1';

const HEX = /^#[0-9a-f]{6}$/i;

export function bannerHex(value: string): string | undefined {
  const trimmed = value.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(trimmed))
    return `#${Array.from(trimmed.slice(1))
      .map((digit) => digit + digit)
      .join('')}`;
  return HEX.test(trimmed) ? trimmed : undefined;
}

export type HostBand = {
  top: string;
  bottom: string;
  /** Text and icon colour on the band. */
  ink: string;
  /** The initial tile's letter colour: the band colour behind the tile. */
  tileInk: string;
  lightInk: boolean;
  image?: string;
  /** Painted across the header row: a gradient banner, or the scrim over a picture. */
  fill?: BandGradient;
  /** A soft shadow behind the ink on a picture. */
  shadow?: string;
};

export type BandGradient = {
  from: string;
  to: string;
  fromOpacity: number;
  toOpacity: number;
  direction: 'diagonal' | 'vertical';
};

const INK_LIGHT = '#ffffff';
const INK_DARK = '#0f1115';

function inkFor(stops: readonly string[]): { ink: string; lightInk: boolean } {
  const worst = (ink: string) => Math.min(...stops.map((stop) => contrast(stop, ink)));
  return worst(INK_LIGHT) >= worst(INK_DARK)
    ? { ink: INK_LIGHT, lightInk: true }
    : { ink: INK_DARK, lightInk: false };
}

function band(
  scheme: ColorScheme,
  color: Record<ColorRole, string>,
  source: string,
): { top: string; bottom: string } {
  const own = headerBand(scheme, withAccent(color, source));
  return { top: own.top, bottom: own.bottom };
}

/**
 * The Chats header band for a Host's look. Custom colours go through the same steps as the
 * accent band (separated from the page, muted in dark mode), and the ink is the one of white or
 * near-black that reads best on every stop.
 */
export function hostBand(
  scheme: ColorScheme,
  color: Record<ColorRole, string>,
  banner: HostBanner,
): HostBand {
  if (banner.kind === 'image') {
    const fallback = headerBand(scheme, color);
    return {
      top: fallback.top,
      bottom: fallback.bottom,
      ink: INK_LIGHT,
      tileInk: INK_DARK,
      lightInk: true,
      image: banner.uri,
      fill: {
        from: '#000000',
        to: '#000000',
        fromOpacity: scheme === 'dark' ? 0.5 : 0.35,
        toOpacity: scheme === 'dark' ? 0.65 : 0.5,
        direction: 'vertical',
      },
      shadow: 'rgba(0, 0, 0, 0.6)',
    };
  }
  if (banner.kind === 'accent') {
    const own = headerBand(scheme, color);
    return {
      top: own.top,
      bottom: own.bottom,
      ink: color[own.ink],
      tileInk: own.top,
      lightInk: own.lightInk,
    };
  }
  const stops =
    banner.kind === 'color'
      ? band(scheme, color, banner.color)
      : {
          top: band(scheme, color, banner.from).top,
          bottom: band(scheme, color, banner.to).top,
        };
  const { ink, lightInk } = inkFor([stops.top, stops.bottom]);
  return { ...stops, ink, tileInk: stops.top, lightInk };
}

/** The fill behind the whole Chats screen, under the panel. */
export function screenBackground(value: HostBand): string {
  return `linear-gradient(180deg, ${value.top} 0%, ${value.bottom} 40%)`;
}

/** A gradient banner paints the header row itself, corner to corner. */
export function headerFill(value: HostBand, banner: HostBanner): BandGradient | undefined {
  if (banner.kind === 'gradient')
    return {
      from: value.top,
      to: value.bottom,
      fromOpacity: 1,
      toOpacity: 1,
      direction: 'diagonal',
    };
  return value.fill;
}
