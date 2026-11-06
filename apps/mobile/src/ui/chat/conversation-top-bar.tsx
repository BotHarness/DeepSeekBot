import type { RefObject } from 'react';
import type { ViewInstance } from 'react-native';

export type ConversationTopBarProps = {
  blurTarget: RefObject<ViewInstance | null>;
  title: string;
  connectionLabel?: string | undefined;
  onBack(): void;
  onProfile?: (() => void) | undefined;
  onCall?: (() => void) | undefined;
  onHeight(height: number): void;
};

export function ConversationTopBar(_props: ConversationTopBarProps) {
  return null;
}
