import { playHaptic } from './haptic-effect';

export type HapticMoment =
  | 'send'
  | 'approve'
  | 'deny'
  | 'submit'
  | 'menu'
  | 'pull'
  | 'react'
  | 'reply'
  | 'selection';

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function haptic(moment: HapticMoment): void {
  if (!enabled) return;
  try {
    void playHaptic(moment).catch(() => undefined);
  } catch {}
}
