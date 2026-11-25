import { View, type ViewProps } from 'react-native';

export const edgeBars = false;

export function EdgeBar({ edge: _edge, ...props }: ViewProps & { edge: 'top' | 'bottom' }) {
  return <View {...props} />;
}
