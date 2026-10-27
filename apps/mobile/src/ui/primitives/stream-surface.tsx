import { View, type ViewProps } from 'react-native';

export function StreamSurface({ active: _active, ...props }: ViewProps & { active: boolean }) {
  return <View {...props} />;
}
