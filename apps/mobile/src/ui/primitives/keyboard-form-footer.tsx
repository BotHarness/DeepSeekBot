import type { ReactNode } from 'react';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function KeyboardFormFooter({
  bottomInset,
  children,
}: {
  bottomInset?: number;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: bottomInset ?? insets.bottom }}>
      {children}
    </KeyboardStickyView>
  );
}
