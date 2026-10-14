import * as Haptics from 'expo-haptics';

export type HapticMoment = 'send' | 'approve' | 'deny' | 'submit';

export function haptic(moment: HapticMoment): void {
  const done =
    moment === 'approve'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : moment === 'deny'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  void done.catch(() => undefined);
}
