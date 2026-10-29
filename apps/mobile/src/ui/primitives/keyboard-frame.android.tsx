import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardProvider, KeyboardStickyView } from 'react-native-keyboard-controller';

import type { KeyboardChatFrameProps } from './keyboard-frame';

export function useListBottomSafeArea(): number {
  return 0;
}

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      {children}
    </KeyboardProvider>
  );
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
      <View style={{ flex: 1 }}>{children}</View>
      <KeyboardStickyView
        onLayout={onComposerLayout}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        {composer}
      </KeyboardStickyView>
    </View>
  );
}
