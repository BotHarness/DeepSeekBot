import type { ReactNode } from 'react';
import { KeyboardAvoidingView, View, type ColorValue, type LayoutChangeEvent } from 'react-native';
import { KeyboardProvider, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../design/tokens';

export interface KeyboardChatFrameProps {
  children: ReactNode;
  composer: ReactNode;
  background?: ReactNode;
  backgroundColor: ColorValue;
  onMount(node: unknown): void;
  onComposerLayout(event: LayoutChangeEvent): void;
}

export function useListBottomSafeArea(): number {
  const bottom = useSafeAreaInsets().bottom;
  const open = useKeyboardState((state) => state.isVisible);
  return open ? 0 : bottom;
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
  const bottom = useSafeAreaInsets().bottom;
  return (
    <View ref={onMount} style={{ flex: 1, backgroundColor }}>
      {background}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={-Math.max(0, bottom - space.x3)}
      >
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
