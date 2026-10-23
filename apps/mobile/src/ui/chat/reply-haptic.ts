import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { BubblePlayback, ConversationPlayback } from '../../host/conversation-playback';
import { haptic } from '../haptics';

const started = new WeakMap<ConversationPlayback, Set<string>>();

export function useReplyHaptic(
  playback: ConversationPlayback | undefined,
  key: string,
  snapshot: BubblePlayback | undefined,
  focused: boolean,
) {
  const hasText =
    snapshot?.message.author === 'bot' &&
    snapshot.message.activity === undefined &&
    snapshot.message.card === undefined &&
    snapshot.message.body.trim() !== '';
  const streaming = snapshot?.streaming === true;
  useEffect(() => {
    if (playback === undefined || !hasText) return;
    let seen = started.get(playback);
    if (seen === undefined) {
      seen = new Set();
      started.set(playback, seen);
    }
    if (seen.has(key)) return;
    seen.add(key);
    if (streaming && focused && AppState.currentState === 'active') haptic('reply');
  }, [playback, key, hasText, streaming, focused]);
}
