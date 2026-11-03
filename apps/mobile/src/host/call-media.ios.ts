import { requireOptionalNativeModule } from 'expo';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import type {
  CallClientMedia,
  CallMediaState,
} from '../../../../packages/core/src/voice/call-client';
import type { CallAudioControl, CallAudioEvent, CallAudioRoute } from './call-audio-route';

type Subscription = { remove(): void };
type CallStateEvent = { attemptId: string; state: CallMediaState; code?: string };
type CallTapEvent = { attemptId: string; kind: string; ms?: number } & Record<string, unknown>;
type NativeAudioEvent = { attemptId: string } & CallAudioEvent;

interface CallNativeModule {
  callStart(
    attemptId: string,
    offer: string,
    testAudio: boolean,
    route?: CallAudioRoute,
  ): Promise<string>;
  callMute(attemptId: string, muted: boolean): void;
  callRoute?(attemptId: string, route: CallAudioRoute): string | null;
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
  options: { testAudio?: boolean; route?: () => CallAudioRoute } = {},
): (CallClientMedia & { audio?: CallAudioControl; test?: CallTestAudio }) | undefined {
  if (!callMediaSupported || native === null) return undefined;
  const module = native;
  const routable = typeof module.callRoute === 'function';
  let attempt: string | undefined;
  let recording: string | null = null;
  const testAudio = options.testAudio === true;
  const media: CallClientMedia & { audio?: CallAudioControl; test?: CallTestAudio } = {
    async start({ callId, offer }) {
      attempt = callId;
      if (!routable) return module.callStart(callId, offer, testAudio);
      return module.callStart(callId, offer, testAudio, options.route?.() ?? 'speaker');
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
      route(route) {
        if (attempt === undefined) return null;
        return module.callRoute?.(attempt, route) ?? null;
      },
      onChange(listener) {
        const subscription = module.addListener('onCallAudio', (event) => {
          if (event.attemptId !== attempt) return;
          listener({
            interrupted: event.interrupted === true,
            ...(typeof event.output === 'string' ? { output: event.output } : {}),
            ...(typeof event.resumed === 'boolean' ? { resumed: event.resumed } : {}),
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
