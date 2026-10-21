import { contrast, mix, type ColorRole, type ColorScheme } from './resolve-theme';

export const HOST_SYMBOLS = {
  desktop: { ios: 'desktopcomputer', android: 'computer' },
  laptop: { ios: 'laptopcomputer', android: 'laptop' },
  display: { ios: 'display', android: 'monitor' },
  server: { ios: 'server.rack', android: 'dns' },
  terminal: { ios: 'terminal', android: 'terminal' },
  cpu: { ios: 'cpu', android: 'memory' },
  home: { ios: 'house', android: 'home' },
  office: { ios: 'building.2', android: 'apartment' },
  work: { ios: 'briefcase', android: 'work' },
  lab: { ios: 'flask', android: 'science' },
  game: { ios: 'gamecontroller', android: 'sports_esports' },
  art: { ios: 'paintbrush', android: 'brush' },
  book: { ios: 'book', android: 'menu_book' },
  globe: { ios: 'globe', android: 'public' },
  bolt: { ios: 'bolt', android: 'bolt' },
  star: { ios: 'star', android: 'star' },
  heart: { ios: 'heart', android: 'favorite' },
  leaf: { ios: 'leaf', android: 'eco' },
} as const;

export type HostSymbolId = keyof typeof HOST_SYMBOLS;

export const HOST_SYMBOL_IDS = Object.keys(HOST_SYMBOLS) as HostSymbolId[];

export const HOST_EMOJI = [
  '💻',
  '🖥️',
  '🏠',
  '🏢',
  '🧪',
  '🎮',
  '🎨',
  '📚',
  '🚀',
  '⚡',
  '🔥',
  '⭐',
  '🌙',
  '☀️',
  '🍀',
  '🐱',
  '🐶',
  '🦊',
] as const;

export type HostIcon = { kind: 'symbol'; id: HostSymbolId } | { kind: 'emoji'; emoji: string };

export const HOST_COLORS = {
  blue: { light: '#007aff', dark: '#0a84ff' },
  indigo: { light: '#5856d6', dark: '#5e5ce6' },
  purple: { light: '#af52de', dark: '#bf5af2' },
  pink: { light: '#ff2d55', dark: '#ff375f' },
  red: { light: '#ff3b30', dark: '#ff453a' },
  orange: { light: '#ff9500', dark: '#ff9f0a' },
  yellow: { light: '#ffcc00', dark: '#ffd60a' },
  green: { light: '#34c759', dark: '#30d158' },
  teal: { light: '#30b0c7', dark: '#40c8e0' },
  graphite: { light: '#8e8e93', dark: '#98989d' },
} as const;

export type HostColorId = keyof typeof HOST_COLORS;

export const HOST_COLOR_IDS = Object.keys(HOST_COLORS) as HostColorId[];

export type HostLook = { name?: string; icon: HostIcon; color?: HostColorId };

export const HOST_NAME_MAX = 40;

export const DEFAULT_HOST_LOOK: HostLook = { icon: { kind: 'symbol', id: 'desktop' } };

export function hostLookName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim().slice(0, HOST_NAME_MAX);
  return trimmed === '' ? undefined : trimmed;
}

export function hostLook(
  name: string | undefined,
  icon: HostIcon,
  color: HostColorId | undefined,
): HostLook {
  return {
    ...(name === undefined ? {} : { name }),
    icon,
    ...(color === undefined ? {} : { color }),
  };
}

export function withHostName(look: HostLook, text: string): HostLook {
  return hostLook(hostLookName(text), look.icon, look.color);
}

export function withHostIcon(look: HostLook, icon: HostIcon): HostLook {
  return hostLook(look.name, icon, look.color);
}

export function withHostColor(look: HostLook, color: HostColorId | undefined): HostLook {
  return hostLook(look.name, look.icon, color);
}

export function shownHostName(look: HostLook, hostName: string): string {
  return look.name ?? hostName;
}

const GRAPHIC_CONTRAST = 3;

export function hostColorInk(
  scheme: ColorScheme,
  color: Record<ColorRole, string>,
  id: HostColorId | undefined,
): string {
  if (id === undefined) return color.accent;
  const source = HOST_COLORS[id][scheme];
  const steps = Array.from({ length: 41 }, (_, step) => step / 40);
  const step =
    steps.find(
      (amount) => contrast(mix(source, color.fg, amount), color.base) >= GRAPHIC_CONTRAST,
    ) ?? 1;
  return mix(source, color.fg, step);
}

export function hostTileFill(
  scheme: ColorScheme,
  color: Record<ColorRole, string>,
  id: HostColorId | undefined,
  behind: string,
): string {
  if (id === undefined) return behind;
  return mix(HOST_COLORS[id][scheme], behind, scheme === 'dark' ? 0.72 : 0.84);
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function nearestHostColor(hex: string): HostColorId | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const [r, g, b] = rgb(hex.toLowerCase());
  const distance = (id: HostColorId) => {
    const [pr, pg, pb] = rgb(HOST_COLORS[id].light);
    return (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
  };
  return HOST_COLOR_IDS.reduce((best, id) => (distance(id) < distance(best) ? id : best));
}
