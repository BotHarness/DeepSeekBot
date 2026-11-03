import type { CallAudioRoute } from '../../host/call-audio-route';

export interface CallAudioMenuProps {
  route: CallAudioRoute;
  size: number;
  fill: string;
  ink: string;
  disabled: boolean;
  onChange(route: CallAudioRoute): void;
}

export function CallAudioMenu(_props: CallAudioMenuProps) {
  return null;
}
