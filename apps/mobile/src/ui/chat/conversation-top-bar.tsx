import type { RefCallback } from 'react';
import type { ViewInstance } from 'react-native';

import type { RosterBot } from '@botharness/host-client/client';
import type { HeaderModel } from './composer-labels';

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
  initial?: string | undefined;
  connectionLabel?: string | undefined;
  model?: HeaderModel | undefined;
  modelMount?: RefCallback<ViewInstance> | undefined;
  onBack(): void;
  onProfile?: (() => void) | undefined;
  onCall?: (() => void) | undefined;
  onHeight(height: number): void;
};

export function ConversationTopBar(_props: ConversationTopBarProps) {
  return null;
}
