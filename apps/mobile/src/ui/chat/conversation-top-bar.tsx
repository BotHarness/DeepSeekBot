import type { RosterBot } from '../../host/client';

export type HeaderSelection = {
  count: number;
  onCancel(): void;
  onCopy(): void;
  onScreenshot(): void;
};

export type ConversationTopBarProps = {
  selection?: HeaderSelection | undefined;
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
