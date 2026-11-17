import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Dimensions, Platform, useColorScheme } from 'react-native';

import { resolveTheme, type Appearance, type ColorScheme, type DesignTheme } from './resolve-theme';
import {
  parseColor,
  toHex,
  type Rgb,
} from '@botharness/host-client/shared/bot-name-color';
import { glass, PRESS_TINT, replyQuote, type PlatformOS } from './tokens';
import { interfacePreferences } from '../interface-preferences';
import { appearanceStore, documentScheme } from '../appearance-store';

export {
  headerBand,
  resolveTheme,
  withAccent,
  type Appearance,
  type ColorRole,
  type ColorScheme,
  type DesignTheme,
  type HeaderBand,
} from './resolve-theme';

function platformOS(): PlatformOS {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

const AppearanceContext = createContext<Appearance>({});

type ResolvedAppearance = {
  scheme: ColorScheme;
  accent: string | undefined;
  os: PlatformOS;
  preset: string | undefined;
  primary: string | undefined;
  style: string | undefined;
  materialEnabled: boolean | undefined;
  materials: unknown;
  theme: DesignTheme;
};

const resolvedAppearances = new WeakMap<Appearance, ResolvedAppearance>();

function sharedTheme(
  owner: Appearance,
  effective: Appearance,
  system: ColorScheme,
  os: PlatformOS,
): DesignTheme {
  const scheme = effective.scheme === 'system' ? system : (effective.scheme ?? system);
  const previous = resolvedAppearances.get(owner);
  if (
    previous?.scheme === scheme &&
    previous.accent === effective.accent &&
    previous.os === os &&
    previous.preset === effective.preset &&
    previous.primary === effective.primary &&
    previous.style === effective.style &&
    previous.materialEnabled === effective.materialEnabled &&
    previous.materials === effective.materials
  )
    return previous.theme;
  const theme = resolveTheme(system, effective, os);
  resolvedAppearances.set(owner, {
    scheme,
    accent: effective.accent,
    os,
    preset: effective.preset,
    primary: effective.primary,
    style: effective.style,
    materialEnabled: effective.materialEnabled,
    materials: effective.materials,
    theme,
  });
  return theme;
}
const subscribeFontScale = (changed: () => void) => {
  const subscription = Dimensions.addEventListener('change', changed);
  return () => subscription.remove();
};
const fontScaleSnapshot = () => Dimensions.get('window').fontScale;

export function DesignThemeProvider({
  appearance,
  children,
}: {
  appearance: Appearance;
  children: ReactNode;
}) {
  return <AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>;
}

export function AccentProvider({
  accent,
  children,
}: {
  accent: string | undefined;
  children: ReactNode;
}) {
  const appearance = useContext(AppearanceContext);
  const tinted = useMemo(
    () => (accent === undefined ? appearance : { ...appearance, accent }),
    [appearance, accent],
  );
  return <AppearanceContext.Provider value={tinted}>{children}</AppearanceContext.Provider>;
}

export function useDesignTheme(): DesignTheme {
  const appearance = useContext(AppearanceContext);
  const preferences = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
  const { document } = useSyncExternalStore(
    appearanceStore.subscribe,
    appearanceStore.getSnapshot,
    appearanceStore.getSnapshot,
  );
  const system: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const effective = useMemo(() => {
    const schemePref = appearance.scheme ?? preferences.appearance;
    const resolvedScheme: ColorScheme =
      schemePref === 'system' || schemePref === undefined ? system : schemePref;
    const modeScheme: ColorScheme =
      document.preference === 'system' ? resolvedScheme : documentScheme(document, system);
    const mode = document.modes[modeScheme];
    return {
      scheme: schemePref,
      style: document.style,
      preset: mode.preset,
      ...(mode.primary !== undefined ? { primary: mode.primary } : {}),
      materialEnabled: document.materialEnabled,
      ...(mode.materials !== undefined ? { materials: mode.materials } : {}),
      ...appearance,
    };
  }, [appearance, preferences.appearance, document, system]);
  const fontScale = useSyncExternalStore(subscribeFontScale, fontScaleSnapshot, fontScaleSnapshot);
  return useMemo(
    () => ({
      ...sharedTheme(appearance, effective, system, platformOS()),
      fontScale,
      largeText: fontScale > 1.3,
    }),
    [appearance, system, effective, fontScale],
  );
}

export function frosted(fill: string): string {
  if (!/^#[0-9a-f]{6}$/iu.test(fill)) return fill;
  const alpha = Math.round((glass.tint / 100) * 255);
  return `${fill}${alpha.toString(16).padStart(2, '0')}`;
}

export function pressTint(ink: string): string {
  if (!/^#[0-9a-f]{6}$/iu.test(ink)) return ink;
  return `${ink}${Math.round(PRESS_TINT * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

export function quoteFill(ink: string, background: string): string {
  const top = parseColor(ink);
  const bottom = parseColor(background);
  if (top === undefined || bottom === undefined) return background;
  const share = replyQuote.tint * top.alpha;
  const mix = (i: 0 | 1 | 2) => top.rgb[i] * share + bottom.rgb[i] * (1 - share);
  return toHex([mix(0), mix(1), mix(2)] satisfies Rgb);
}

export function glassTint(base: string): string {
  return `color-mix(in srgb, ${base} ${glass.tint}%, transparent)`;
}

export function glassShadow(scheme: ColorScheme): string {
  return scheme === 'dark' ? '0 8px 24px rgba(0, 0, 0, 0.5)' : '0 8px 24px rgba(15, 17, 21, 0.12)';
}
