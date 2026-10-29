import { ActivityIndicator, type ColorValue } from 'react-native';

export type LoadingIndicatorSize = 'page' | 'control';

export function LoadingIndicator({
  color,
  accessibilityLabel,
}: {
  color?: ColorValue;
  accessibilityLabel?: string;
  size?: LoadingIndicatorSize;
}) {
  return (
    <ActivityIndicator
      {...(color === undefined ? {} : { color })}
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
    />
  );
}
