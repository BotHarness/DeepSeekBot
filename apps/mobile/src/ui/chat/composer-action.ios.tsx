import type { ReactNode } from 'react';
import { useDesignTheme } from '../design/theme';
import { composerControl } from './composer-chrome';
import { NativeComposerButton } from './native-composer-button.ios';
import type { ComposerSymbol } from './composer-symbol';

export function ComposerActionButton(props: {
  label: string;
  filled: boolean;
  symbol: ComposerSymbol;
  onPress(): void;
  testID?: string;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return <NativeComposerButton {...props} size={composerControl(theme)} />;
}
