import type { RosterBot } from '@botharness/host-client/client';
import type { ChatHeaderMenu } from './chat-header-actions';

export type HeaderSelection = {
  count: number;
  onCancel(): void;
  onCopy(): void;
  onScreenshot(): void;
};

export type ConversationTopBarProps = {
  variant?: 'session';
  selection?: HeaderSelection | undefined;
  title: string;
  subtitle?: string | undefined;
  bot?: RosterBot | undefined;
  activeBots?: readonly RosterBot[] | undefined;
  avatar?: string | undefined;
  initial?: string | undefined;
  connectionLabel?: string | undefined;
  onBack(): void;
  onProfile?: (() => void) | undefined;
  onCall?: (() => void) | undefined;
  menu?: ChatHeaderMenu | undefined;
  onHeight?(height: number): void;
};

export function ConversationTopBar(_props: ConversationTopBarProps) {
  return null;
}
