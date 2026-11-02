import { Host, ModalBottomSheet, RNHostView } from '@expo/ui/jetpack-compose';
import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';

export function MarketplaceTopicSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose(): void;
}) {
  const theme = useDesignTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={onClose} skipPartiallyExpanded>
        <RNHostView>
          <View style={{ height: height - insets.top - insets.bottom - theme.touch * 2 }}>
            {children}
          </View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  );
}
