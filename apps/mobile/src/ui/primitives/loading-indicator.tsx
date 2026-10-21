import { ActivityIndicator, type ColorValue } from 'react-native';

export function LoadingIndicator({
  color,
  accessibilityLabel,
}: {
  color?: ColorValue;
  accessibilityLabel?: string;
}) {
  return (
    <ActivityIndicator
      {...(color === undefined ? {} : { color })}
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
    />
  );
}
