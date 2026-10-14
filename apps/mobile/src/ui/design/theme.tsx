import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { resolveTheme, type Appearance, type ColorScheme, type DesignTheme } from './resolve-theme';
import type { PlatformOS } from './tokens';

export {
  resolveTheme,
  type Appearance,
  type ColorRole,
  type ColorScheme,
  type DesignTheme,
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

export function useDesignTheme(): DesignTheme {
  const appearance = useContext(AppearanceContext);
  const system: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => resolveTheme(system, appearance, platformOS()), [system, appearance]);
}
