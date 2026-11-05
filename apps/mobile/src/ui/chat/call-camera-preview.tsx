import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ViewProps } from 'react-native';

const NativePreview =
  requireOptionalNativeModule('CallCamera') === null
    ? undefined
    : requireNativeView<ViewProps>('CallCamera');

export function CallCameraPreview(props: ViewProps) {
  return NativePreview === undefined ? null : <NativePreview {...props} />;
}
