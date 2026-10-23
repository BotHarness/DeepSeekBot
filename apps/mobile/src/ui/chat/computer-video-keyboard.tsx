import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import type { DesktopInput } from '../../../../../packages/computer/src/desktop-view';
import { edge } from '../design/tokens';

export interface KeyboardInputEvent {
  session: string;
  input: Extract<DesktopInput, { kind: 'type' | 'key' }>;
}

interface NativeKeyboardProps extends ViewProps {
  session: string;
  opened: boolean;
  accepting: boolean;
  onInput(event: NativeSyntheticEvent<KeyboardInputEvent>): void;
  onDismissed(event: NativeSyntheticEvent<{ session: string }>): void;
}

const NativeKeyboard =
  requireOptionalNativeModule('RemoteKeyboard') === null
    ? undefined
    : requireNativeView<NativeKeyboardProps>('RemoteKeyboard');

export const remoteKeyboardAvailable = NativeKeyboard !== undefined;

export function ComputerVideoKeyboard({
  open,
  enabled,
  session,
  onInput,
  onClose,
}: {
  open: boolean;
  enabled: boolean;
  session: string;
  onInput(input: DesktopInput): Promise<boolean>;
  onClose(): void;
}) {
  if (NativeKeyboard === undefined) return null;
  return (
    <NativeKeyboard
      testID="computer-video-native-keyboard"
      session={session}
      opened={open}
      accepting={open && enabled}
      style={{ position: 'absolute', width: edge.hairline, height: edge.hairline }}
      onInput={({ nativeEvent }) => {
        if (!open || !enabled || nativeEvent.session !== session) return;
        void onInput(nativeEvent.input).then(
          (accepted) => {
            if (!accepted) onClose();
          },
          () => onClose(),
        );
      }}
      onDismissed={({ nativeEvent }) => {
        if (open && nativeEvent.session === session) onClose();
      }}
    />
  );
}
