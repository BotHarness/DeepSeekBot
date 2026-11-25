import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { View, type ViewProps } from 'react-native';

type EdgeBarProps = ViewProps & { edge: 'top' | 'bottom' };

const NativeEdgeBar =
  requireOptionalNativeModule('SessionDrawerEdge') === null
    ? undefined
    : requireNativeView<EdgeBarProps>('SessionDrawerEdge');

export const edgeBars = NativeEdgeBar !== undefined;

export function EdgeBar({ edge, ...props }: EdgeBarProps) {
  return NativeEdgeBar === undefined ? (
    <View {...props} />
  ) : (
    <NativeEdgeBar edge={edge} {...props} />
  );
}
