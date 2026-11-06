import type { RefObject } from 'react';
import type { ViewInstance } from 'react-native';
import type { RosterBot } from '../../host/client';

export type ConversationTopBarProps = {
  blurTarget: RefObject<ViewInstance | null>;
  title: string;
  subtitle?: string | undefined;
  bot?: RosterBot | undefined;
  activeBots?: readonly RosterBot[] | undefined;
  avatar?: string | undefined;
  connectionLabel?: string | undefined;
  onBack(): void;
  onProfile?: (() => void) | undefined;
  onCall?: (() => void) | undefined;
  onHeight(height: number): void;
};

export function ConversationTopBar(_props: ConversationTopBarProps) {
  return null;
}
