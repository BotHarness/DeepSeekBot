import { createContext, useContext, type ReactNode } from 'react';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

const WindowInsets = createContext<EdgeInsets | undefined>(undefined);

function PublishWindowInsets({ children }: { children: ReactNode }) {
  return <WindowInsets value={useSafeAreaInsets()}>{children}</WindowInsets>;
}

export function WindowSafeAreaProvider({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <PublishWindowInsets>{children}</PublishWindowInsets>
    </SafeAreaProvider>
  );
}

export function useWindowInsets(): EdgeInsets {
  const local = useSafeAreaInsets();
  return useContext(WindowInsets) ?? local;
}
