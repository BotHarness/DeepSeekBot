import { requireOptionalNativeModule } from 'expo';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import type {
  CallClientMedia,
  CallMediaState,
} from '../../../../packages/core/src/voice/call-client';
import {
  DEFAULT_CALL_AUDIO,
  parseCallAudioRouteState,
  type CallAudioControl,
  type CallAudioOutputId,
  type CallAudioPreference,
  type CallMicrophoneId,
} from './call-audio-route';

type Subscription = { remove(): void };
type CallStateEvent = { attemptId: string; state: CallMediaState; code?: string };
type CallTapEvent = { attemptId: string; kind: string; ms?: number } & Record<string, unknown>;
type NativeAudioEvent = {
  attemptId: string;
  interrupted?: boolean;
  resumed?: boolean;
  route?: unknown;
};

interface CallNativeModule {
  readonly callAudioSupported?: boolean;
  callStart(
    attemptId: string,
    offer: string,
    testAudio: boolean,
    headsetMicrophone?: CallMicrophoneId,
  ): Promise<string>;
  callMute(attemptId: string, muted: boolean): void;
  callAudio?(
    attemptId: string,
    output: CallAudioOutputId,
    microphone: CallMicrophoneId,
  ): Promise<unknown>;
  callAudioState?(attemptId: string): Promise<unknown>;
  callInject(attemptId: string, path: string): Promise<boolean>;
  callStop(attemptId: string): Promise<string | null>;
  addListener(event: 'onCallState', listener: (event: CallStateEvent) => void): Subscription;
  addListener(event: 'onCallTap', listener: (event: CallTapEvent) => void): Subscription;
  addListener(event: 'onCallAudio', listener: (event: NativeAudioEvent) => void): Subscription;
}

const native = requireOptionalNativeModule<CallNativeModule>('LocalComputerVideo');

export const callMediaSupported =
  native !== null && typeof (native as Partial<CallNativeModule>).callStart === 'function';

export type MicrophoneAccess = 'granted' | 'denied' | 'blocked';

export async function microphoneGranted(): Promise<boolean> {
  return (await getRecordingPermissionsAsync()).granted;
}

export async function microphoneAccess(): Promise<MicrophoneAccess> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';
  const asked = await requestRecordingPermissionsAsync();
  return asked.granted ? 'granted' : asked.canAskAgain ? 'denied' : 'blocked';
}

export interface CallTestAudio {
  inject(path: string): Promise<boolean>;
  onTap(listener: (event: CallTapEvent) => void): () => void;
  recording(): string | null;
}

export function createCallMedia(
  options: { testAudio?: boolean; audio?: () => CallAudioPreference } = {},
): (CallClientMedia & { audio?: CallAudioControl; test?: CallTestAudio }) | undefined {
  if (!callMediaSupported || native === null) return undefined;
  const module = native;
  const routable = typeof module.callAudio === 'function' && module.callAudioSupported !== false;
  let attempt: string | undefined;
  let recording: string | null = null;
  const testAudio = options.testAudio === true;
  const media: CallClientMedia & { audio?: CallAudioControl; test?: CallTestAudio } = {
    async start({ callId, offer }) {
      attempt = callId;
      if (typeof module.callAudio !== 'function') return module.callStart(callId, offer, testAudio);
      const audio = options.audio?.() ?? DEFAULT_CALL_AUDIO;
      return module.callStart(callId, offer, testAudio, audio.headsetMicrophone);
    },
    mute(muted) {
      if (attempt !== undefined) module.callMute(attempt, muted);
    },
    stop() {
      const current = attempt;
      attempt = undefined;
      if (current === undefined) return;
      void module.callStop(current).then(
        (path) => {
          recording = path;
        },
        () => undefined,
      );
    },
    onState(listener) {
      const subscription = module.addListener('onCallState', (event) => {
        if (event.attemptId === attempt) listener(event.state, event.code);
      });
      return () => subscription.remove();
    },
  };
  if (routable)
    media.audio = {
      async choose(output, microphone) {
        if (attempt === undefined) return null;
        const next = await module.callAudio?.(attempt, output, microphone).catch(() => undefined);
        return parseCallAudioRouteState(next) ?? null;
      },
      async state() {
        if (attempt === undefined) return null;
        const current = await module.callAudioState?.(attempt).catch(() => undefined);
        return parseCallAudioRouteState(current) ?? null;
      },
      onChange(listener) {
        const subscription = module.addListener('onCallAudio', (event) => {
          if (event.attemptId !== attempt) return;
          const route = parseCallAudioRouteState(event.route);
          listener({
            interrupted: event.interrupted === true,
            ...(typeof event.resumed === 'boolean' ? { resumed: event.resumed } : {}),
            ...(route === undefined ? {} : { route }),
          });
        });
        return () => subscription.remove();
      },
    };
  if (testAudio)
    media.test = {
      inject: async (path) => (attempt === undefined ? false : module.callInject(attempt, path)),
      onTap(listener) {
        const subscription = module.addListener('onCallTap', listener);
        return () => subscription.remove();
      },
      recording: () => recording,
    };
  return media;
}
