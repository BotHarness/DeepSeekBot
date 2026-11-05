import type { CallAudioDevice } from '../../host/call-audio-route';
import type { callStrings } from '../strings';

type Strings = { readonly call: (typeof callStrings)['en'] };

export type CallAudioSymbol =
  | 'iphone'
  | 'speaker.wave.2.fill'
  | 'headphones'
  | 'airpods'
  | 'car.fill'
  | 'airplayaudio';

export function callAudioDeviceSymbol(
  device: CallAudioDevice<string> | undefined,
): CallAudioSymbol {
  switch (device?.kind) {
    case 'iphone':
    case 'receiver':
      return 'iphone';
    case 'bluetooth':
      return /airpods/i.test(device.name) ? 'airpods' : 'headphones';
    case 'headphones':
    case 'other':
      return 'headphones';
    case 'car':
      return 'car.fill';
    case 'airplay':
      return 'airplayaudio';
    default:
      return 'speaker.wave.2.fill';
  }
}

export function callAudioDeviceName(
  t: Strings,
  device: CallAudioDevice<string> | undefined,
): string {
  if (device === undefined) return t.call.audioDevices.speaker;
  const builtIn =
    device.kind === 'iphone' || device.kind === 'receiver' || device.kind === 'speaker';
  if (builtIn || device.name.trim() === '') return t.call.audioDevices[device.kind];
  return device.name;
}
