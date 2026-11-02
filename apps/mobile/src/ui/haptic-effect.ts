import * as Haptics from 'expo-haptics';

import type { HapticMoment } from './haptics';

export function playHaptic(moment: HapticMoment): Promise<void> {
  return moment === 'selection'
    ? Haptics.selectionAsync()
    : moment === 'approve'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : moment === 'deny'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
