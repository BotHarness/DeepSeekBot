import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

import type { HapticMoment } from './haptics';

export function playHaptic(moment: HapticMoment): Promise<void> {
  return performAndroidHapticsAsync(
    moment === 'selection'
      ? AndroidHaptics.Segment_Tick
      : moment === 'approve'
        ? AndroidHaptics.Confirm
        : moment === 'deny'
          ? AndroidHaptics.Reject
          : AndroidHaptics.Context_Click,
  );
}
