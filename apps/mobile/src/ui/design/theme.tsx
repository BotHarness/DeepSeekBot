import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { resolveTheme, type Appearance, type ColorScheme, type DesignTheme } from './resolve-theme';
import { glass, type PlatformOS } from './tokens';

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
  const system: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => resolveTheme(system, appearance, platformOS()), [system, appearance]);
}

export function frosted(fill: string): string {
  if (!/^#[0-9a-f]{6}$/iu.test(fill)) return fill;
  const alpha = Math.round((glass.tint / 100) * 255);
  return `${fill}${alpha.toString(16).padStart(2, '0')}`;
}

export function glassTint(base: string): string {
  return `color-mix(in srgb, ${base} ${glass.tint}%, transparent)`;
}

export function glassShadow(scheme: ColorScheme): string {
  return scheme === 'dark' ? '0 8px 24px rgba(0, 0, 0, 0.5)' : '0 8px 24px rgba(15, 17, 21, 0.12)';
}
