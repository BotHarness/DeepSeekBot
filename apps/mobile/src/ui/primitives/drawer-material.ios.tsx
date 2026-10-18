import { Capsule, Host } from '@expo/ui/swift-ui';
import { accessibilityHidden, foregroundStyle, glassEffect } from '@expo/ui/swift-ui/modifiers';
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { edge, radius } from '../design/tokens';
import { useDesignTheme } from '../design/theme';

let reduced = true;
const readTransparency = () => reduced;
function subscribeTransparency(notify: () => void) {
  let active = true;
  let changed = false;
  const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (value) => {
    changed = true;
    reduced = value;
    notify();
  });
  void AccessibilityInfo.isReduceTransparencyEnabled().then(
    (value) => {
      if (!active || changed) return;
      reduced = value;
      notify();
    },
    () => {},
  );
  return () => {
    active = false;
    subscription.remove();
  };
}

export function DrawerMaterial({ rounded = false }: { rounded?: boolean }) {
  const theme = useDesignTheme();
  const reduceTransparency = useSyncExternalStore(subscribeTransparency, readTransparency);
  const glass =
    Number.parseInt(String(Platform.Version), 10) >= 26 && !reduceTransparency && !rounded;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: rounded ? radius.lg : radius.round,
          borderWidth: glass ? 0 : edge.hairline,
          borderColor: theme.layer.raised.edge,
          backgroundColor: glass ? 'transparent' : theme.layer.raised.fill,
        },
      ]}
    >
      {glass ? (
        <Host style={StyleSheet.absoluteFill} colorScheme={theme.scheme} pointerEvents="none">
          <Capsule
            modifiers={[
              foregroundStyle('transparent'),
              glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' }),
              accessibilityHidden(),
            ]}
          />
        </Host>
      ) : null}
    </View>
  );
}
