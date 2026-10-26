import type { ScrollViewProps } from 'react-native';
import type { ReactElement } from 'react';

export interface ChatKeyboardCoordination {
  onStart(): void;
  onEnd(): void;
  onInsetChange(insets: { bottom: number }): void;
}

export function useChatScrollAdapter(
  _keyboard: ChatKeyboardCoordination,
  _held: boolean,
): ((props: ScrollViewProps) => ReactElement) | undefined {
  return undefined;
}

export function useChatOverlayStyle(): undefined {
  return undefined;
}
