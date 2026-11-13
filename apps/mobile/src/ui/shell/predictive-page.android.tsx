import { requireNativeView } from 'expo';
import { useIsFocused, useNavigation } from 'expo-router';
import { useSyncExternalStore, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { backHeld, watchBackHeld } from './back-owner';
import { useDesignTheme } from '../design/theme';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';

const NativePage = requireNativeView<
  ViewProps & {
    active: boolean;
    reducedMotion: boolean;
    onBack(): void;
  }
>('PredictiveBack');

export function PredictivePage({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const held = useSyncExternalStore(watchBackHeld, backHeld);
  const reducedMotion = useSystemReducedMotion();
  const theme = useDesignTheme();
  return (
    <NativePage
      style={{ flex: 1 }}
      active={focused && !held && navigation.canGoBack()}
      reducedMotion={reducedMotion}
      onBack={() => {
        if (navigation.canGoBack()) navigation.goBack();
      }}
    >
      <View collapsable={false} style={{ flex: 1, backgroundColor: theme.color.base }}>
        {children}
      </View>
    </NativePage>
  );
}
