import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { MessageTargetProps } from './message-target';
import type { ViewProps } from 'react-native';

export const nativeMessageJump =
  process.env.EXPO_PUBLIC_MESSAGE_JUMP === 'native' &&
  requireOptionalNativeModule<{ supported: boolean }>('MessageTarget')?.supported === true;
const Target = nativeMessageJump
  ? requireNativeView<
      ViewProps & {
        request: string;
        active: boolean;
        top: number;
        bottom: number;
        onPositioned(event: { nativeEvent: { request: string } }): void;
      }
    >('MessageTarget')
  : undefined;

export function MessageTarget({ children, onPositioned, ...props }: MessageTargetProps) {
  if (Target === undefined) return children;
  return (
    <Target {...props} onPositioned={({ nativeEvent }) => onPositioned(nativeEvent.request)}>
      {children}
    </Target>
  );
}
