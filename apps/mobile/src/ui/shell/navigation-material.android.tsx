import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { edge, navigationBar, radius } from '../design/tokens';

export function NavigationMaterial({
  rounded = false,
  circle = false,
}: {
  rounded?: boolean;
  circle?: boolean;
}) {
  const theme = useDesignTheme();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: circle ? radius.round : rounded ? radius.xl : navigationBar.radius,
          backgroundColor: rounded ? theme.overlay.fill : theme.layer.raised.fill,
          borderWidth: edge.hairline,
          borderColor: theme.layer.raised.edge,
          boxShadow: navigationBar.shadow[theme.scheme],
        },
      ]}
    />
  );
}
