import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useRef } from 'react';
import { View, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { createRemoteKeyboardInput } from '../../host/remote-keyboard-input';
import { useMounted } from '../mounted';
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
  const queue = useRef<ReturnType<typeof createRemoteKeyboardInput> | undefined>(undefined);
  const lifecycle = useMounted<View>(() => {
    const current = createRemoteKeyboardInput();
    queue.current = current;
    return () => {
      current.stop();
      if (queue.current === current) queue.current = undefined;
    };
  }, [open, enabled, session]);
  if (NativeKeyboard === undefined) return null;
  return (
    <View
      ref={lifecycle}
      style={{ position: 'absolute', width: edge.hairline, height: edge.hairline }}
    >
      <NativeKeyboard
        testID="computer-video-native-keyboard"
        session={session}
        opened={open}
        accepting={open && enabled}
        style={{ position: 'absolute', width: edge.hairline, height: edge.hairline }}
        onInput={({ nativeEvent }) => {
          if (!open || !enabled || nativeEvent.session !== session) return;
          queue.current?.enqueue(nativeEvent.input, onInput, onClose);
        }}
        onDismissed={({ nativeEvent }) => {
          if (open && nativeEvent.session === session) onClose();
        }}
      />
    </View>
  );
}
