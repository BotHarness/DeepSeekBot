import type { ReactNode } from 'react';
import { KeyboardAvoidingView, View, type ColorValue, type LayoutChangeEvent } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

export interface KeyboardChatFrameProps {
  children: ReactNode;
  composer: ReactNode;
  background?: ReactNode;
  backgroundColor: ColorValue;
  onMount(node: unknown): void;
  onComposerLayout(event: LayoutChangeEvent): void;
}

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export function KeyboardChatFrame({
  children,
  composer,
  background,
  backgroundColor,
  onMount,
  onComposerLayout,
}: KeyboardChatFrameProps) {
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={{ flex: 1 }}>
          {children}
          <View
            onLayout={onComposerLayout}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
          >
            {composer}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
