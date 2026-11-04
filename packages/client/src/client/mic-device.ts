export const CALL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export const MIC_DEVICE_STORAGE_KEY = 'botharness.voice-mic.v1';

const PSEUDO_DEVICES = new Set(['', 'default', 'communications']);

export interface MicOption {
  readonly id: string;
  readonly label: string;
}

export interface MicDeviceInfo {
  readonly kind: string;
  readonly deviceId: string;
  readonly label: string;
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readMicDevice(store: Storage | undefined = storage()): string | undefined {
  try {
    const value = store?.getItem(MIC_DEVICE_STORAGE_KEY);
    return value === null || value === undefined || PSEUDO_DEVICES.has(value) ? undefined : value;
  } catch {
    return undefined;
  }
}

export function writeMicDevice(
  id: string | undefined,
  store: Storage | undefined = storage(),
): void {
  try {
    if (id === undefined || PSEUDO_DEVICES.has(id)) store?.removeItem(MIC_DEVICE_STORAGE_KEY);
    else store?.setItem(MIC_DEVICE_STORAGE_KEY, id);
  } catch {
    return;
  }
}

export function micOptions(devices: readonly MicDeviceInfo[]): MicOption[] {
  const seen = new Set<string>();
  const options: MicOption[] = [];
  for (const device of devices) {
    if (device.kind !== 'audioinput' || PSEUDO_DEVICES.has(device.deviceId)) continue;
    if (seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    options.push({ id: device.deviceId, label: device.label.trim() });
  }
  return options;
}

export function savedMicMissing(saved: string | undefined, options: readonly MicOption[]): boolean {
  return saved !== undefined && options.length > 0 && !options.some((item) => item.id === saved);
}

export function micConstraints(id: string | undefined): MediaTrackConstraints {
  return id === undefined
    ? { ...CALL_AUDIO_CONSTRAINTS }
    : { ...CALL_AUDIO_CONSTRAINTS, deviceId: { exact: id } };
}

export async function openMicrophone(
  media: Pick<MediaDevices, 'getUserMedia'>,
  store: Storage | undefined = storage(),
): Promise<{ stream: MediaStream; fellBack: boolean }> {
  const saved = readMicDevice(store);
  try {
    return {
      stream: await media.getUserMedia({ audio: micConstraints(saved), video: false }),
      fellBack: false,
    };
  } catch (error) {
    const name = (error as { name?: unknown } | undefined)?.name;
    if (saved === undefined || (name !== 'OverconstrainedError' && name !== 'NotFoundError'))
      throw error;
    const stream = await media.getUserMedia({ audio: micConstraints(undefined), video: false });
    writeMicDevice(undefined, store);
    return { stream, fellBack: true };
  }
}
