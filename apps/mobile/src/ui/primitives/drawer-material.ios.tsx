import { Capsule, Host, Mask, Rectangle, RoundedRectangle } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  foregroundStyle,
  glassEffect,
  ignoreSafeArea,
} from '@expo/ui/swift-ui/modifiers';
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { edge, pointer, radius } from '../design/tokens';
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

export function useLiquidGlass(): boolean {
  const reduceTransparency = useSyncExternalStore(subscribeTransparency, readTransparency);
  return Number.parseInt(String(Platform.Version), 10) >= 26 && !reduceTransparency;
}

export function SidebarMaterial({ cornerRadius }: { cornerRadius: number }) {
  const theme = useDesignTheme();
  return (
    <Host
      key={theme.scheme}
      style={StyleSheet.absoluteFill}
      colorScheme={theme.scheme}
      pointerEvents="none"
    >
      <RoundedRectangle
        cornerRadius={cornerRadius}
        modifiers={[
          foregroundStyle('transparent'),
          glassEffect({
            glass: { variant: 'regular' },
            shape: 'roundedRectangle',
            cornerRadius,
          }),
          accessibilityHidden(),
        ]}
      />
    </Host>
  );
}

export function EdgeMaterial({ edge: side, solid }: { edge: 'top' | 'bottom'; solid: number }) {
  const theme = useDesignTheme();
  const top = side === 'top';
  return (
    <Host
      key={theme.scheme}
      style={StyleSheet.absoluteFill}
      colorScheme={theme.scheme}
      pointerEvents="none"
    >
      <Mask modifiers={[accessibilityHidden(), ignoreSafeArea({ edges: 'all' })]}>
        <Rectangle modifiers={[foregroundStyle({ type: 'material', material: 'thin' })]} />
        <Mask.Content>
          <Rectangle
            modifiers={[
              foregroundStyle({
                type: 'linearGradient',
                colors: [pointer.rim, `${pointer.rim}00`],
                startPoint: { x: 0.5, y: top ? solid : 1 - solid },
                endPoint: { x: 0.5, y: top ? 1 : 0 },
              }),
            ]}
          />
        </Mask.Content>
      </Mask>
    </Host>
  );
}

export function DrawerMaterial({
  rounded = false,
  glassPanel = false,
}: {
  rounded?: boolean;
  glassPanel?: boolean;
}) {
  const theme = useDesignTheme();
  const reduceTransparency = useSyncExternalStore(subscribeTransparency, readTransparency);
  const glass =
    Number.parseInt(String(Platform.Version), 10) >= 26 &&
    !reduceTransparency &&
    (!rounded || glassPanel);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: glassPanel ? radius.xl : rounded ? radius.lg : radius.round,
          borderWidth: glass ? 0 : edge.hairline,
          borderColor: theme.layer.raised.edge,
          backgroundColor: glass ? 'transparent' : theme.layer.raised.fill,
        },
      ]}
    >
      {glass ? (
        <Host
          key={theme.scheme}
          style={StyleSheet.absoluteFill}
          colorScheme={theme.scheme}
          pointerEvents="none"
        >
          {rounded ? (
            <RoundedRectangle
              cornerRadius={radius.xl}
              modifiers={[
                foregroundStyle('transparent'),
                glassEffect({
                  glass: { variant: 'regular' },
                  shape: 'roundedRectangle',
                  cornerRadius: radius.xl,
                }),
                accessibilityHidden(),
              ]}
            />
          ) : (
            <Capsule
              modifiers={[
                foregroundStyle('transparent'),
                glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' }),
                accessibilityHidden(),
              ]}
            />
          )}
        </Host>
      ) : null}
    </View>
  );
}
