export type CallAudioOutputId = 'receiver' | 'speaker' | 'external';

export type CallMicrophoneId = 'iphone' | 'headset';

export type CallAudioDeviceKind =
  | 'iphone'
  | 'receiver'
  | 'speaker'
  | 'bluetooth'
  | 'headphones'
  | 'car'
  | 'airplay'
  | 'other';

export type CallAudioDevice<Id extends string> = {
  readonly id: Id;
  readonly kind: CallAudioDeviceKind;
  readonly name: string;
};

export type CallAudioOutput = CallAudioDevice<CallAudioOutputId>;
export type CallMicrophone = CallAudioDevice<CallMicrophoneId>;

export type CallAudioRouteState = {
  readonly output: CallAudioOutputId;
  readonly outputs: readonly CallAudioOutput[];
  readonly microphone: CallMicrophoneId;
  readonly microphones: readonly CallMicrophone[];
  readonly music: boolean;
};

export type CallAudioEvent = {
  interrupted: boolean;
  resumed?: boolean;
  route?: CallAudioRouteState;
};

export interface CallAudioControl {
  choose(
    output: CallAudioOutputId,
    microphone: CallMicrophoneId,
  ): Promise<CallAudioRouteState | null>;
  state(): Promise<CallAudioRouteState | null>;
  onChange(listener: (event: CallAudioEvent) => void): () => void;
}

const OUTPUT_IDS: readonly CallAudioOutputId[] = ['receiver', 'speaker', 'external'];
const MICROPHONE_IDS: readonly CallMicrophoneId[] = ['iphone', 'headset'];
const KINDS: readonly CallAudioDeviceKind[] = [
  'iphone',
  'receiver',
  'speaker',
  'bluetooth',
  'headphones',
  'car',
  'airplay',
  'other',
];

export type CallAudioPreference = { readonly headsetMicrophone: CallMicrophoneId };

export const DEFAULT_CALL_AUDIO: CallAudioPreference = { headsetMicrophone: 'headset' };

export function parseCallAudioPreference(value: unknown): CallAudioPreference | undefined {
  if (value === 'speaker' || value === 'receiver') return DEFAULT_CALL_AUDIO;
  if (value === 'media') return { headsetMicrophone: 'iphone' };
  if (typeof value !== 'object' || value === null) return undefined;
  const { headsetMicrophone, type, builtIn } = value as Record<string, unknown>;
  if (headsetMicrophone === 'iphone' || headsetMicrophone === 'headset')
    return { headsetMicrophone };
  if (type === 'media') return { headsetMicrophone: 'iphone' };
  if (type === 'call' && (builtIn === 'speaker' || builtIn === 'receiver'))
    return DEFAULT_CALL_AUDIO;
  return undefined;
}

function parseDevices<Id extends string>(
  value: unknown,
  ids: readonly Id[],
): CallAudioDevice<Id>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: CallAudioDevice<Id>[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, kind, name } = entry as Record<string, unknown>;
    const knownId = ids.find((candidate) => candidate === id);
    if (knownId === undefined || parsed.some((device) => device.id === knownId)) continue;
    parsed.push({
      id: knownId,
      kind: KINDS.find((candidate) => candidate === kind) ?? 'other',
      name: typeof name === 'string' ? name : '',
    });
  }
  return parsed;
}

export function parseCallAudioRouteState(value: unknown): CallAudioRouteState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const fields = value as Record<string, unknown>;
  const outputs = parseDevices(fields['outputs'], OUTPUT_IDS);
  const microphones = parseDevices(fields['microphones'], MICROPHONE_IDS);
  if (outputs === undefined || microphones === undefined) return undefined;
  const output = outputs.find((device) => device.id === fields['output'])?.id;
  const microphone = microphones.find((device) => device.id === fields['microphone'])?.id;
  if (output === undefined || microphone === undefined) return undefined;
  return { output, outputs, microphone, microphones, music: fields['music'] === true };
}

export function fallbackCallAudioRoute(): CallAudioRouteState {
  return {
    output: 'speaker',
    outputs: [
      { id: 'receiver', kind: 'receiver', name: '' },
      { id: 'speaker', kind: 'speaker', name: '' },
    ],
    microphone: 'iphone',
    microphones: [{ id: 'iphone', kind: 'iphone', name: '' }],
    music: false,
  };
}

export type CallAudioPreferenceSnapshot = {
  readonly audio: CallAudioPreference;
  readonly loaded: boolean;
  readonly storageError: boolean;
};

export function createCallAudioPreference(storage: {
  read(): Promise<unknown>;
  write(audio: CallAudioPreference): void;
}) {
  let snapshot: CallAudioPreferenceSnapshot = {
    audio: DEFAULT_CALL_AUDIO,
    loaded: false,
    storageError: false,
  };
  let touched = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      storage.write(snapshot.audio);
      snapshot = { ...snapshot, storageError: false };
    } catch {
      snapshot = { ...snapshot, storageError: true };
    }
  };
  const ready = storage
    .read()
    .then(
      (value) => {
        const saved = parseCallAudioPreference(value);
        if (!touched && saved !== undefined) snapshot = { ...snapshot, audio: saved };
        else if (value !== undefined && saved === undefined)
          snapshot = { ...snapshot, storageError: true };
        return (
          saved !== undefined &&
          (typeof value !== 'object' || value === null || !('headsetMicrophone' in value))
        );
      },
      () => {
        snapshot = { ...snapshot, storageError: true };
        return false;
      },
    )
    .then((migrate) => {
      snapshot = { ...snapshot, loaded: true };
      if (touched || migrate) persist();
      notify();
    });
  return {
    ready,
    getSnapshot: () => snapshot,
    setHeadsetMicrophone(headsetMicrophone: CallMicrophoneId) {
      touched = true;
      if (headsetMicrophone === snapshot.audio.headsetMicrophone) return;
      snapshot = { ...snapshot, audio: { headsetMicrophone } };
      if (snapshot.loaded) persist();
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type CallAudioPreferenceStore = ReturnType<typeof createCallAudioPreference>;
