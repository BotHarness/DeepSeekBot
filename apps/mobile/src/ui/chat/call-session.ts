import type { CallClientState } from '../../../../../packages/core/src/voice/call-client';
import type { CallAudioRoute } from '../../host/call-audio-route';
import type { MicrophoneAccess } from '../../host/call-media';

export type CallRequest = {
  slug: string;
  hostId?: string | undefined;
  script?: string | undefined;
};

export type CallSessionSnapshot = {
  key: number;
  request: CallRequest;
  expanded: boolean;
  attempt: number;
  state: CallClientState;
  startedAt?: number | undefined;
  microphone?: MicrophoneAccess | undefined;
  interrupted: boolean;
  report?: string | undefined;
  supported: boolean;
  audioRoutes: boolean;
};

export interface CallControls {
  mute(muted: boolean): void;
  hangup(): void;
  route(route: CallAudioRoute): boolean;
}

export type CallSessionPatch = Partial<
  Pick<
    CallSessionSnapshot,
    'state' | 'startedAt' | 'microphone' | 'interrupted' | 'report' | 'supported' | 'audioRoutes'
  >
>;

export const sameCall = (a: CallRequest, b: CallRequest) =>
  a.slug === b.slug && a.hostId === b.hostId;

export function createCallSessions() {
  let snapshot: CallSessionSnapshot | undefined;
  let controls: { key: number; value: CallControls } | undefined;
  let next = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const set = (value: CallSessionSnapshot | undefined) => {
    snapshot = value;
    emit();
  };
  const current = () =>
    controls !== undefined && controls.key === snapshot?.key ? controls.value : undefined;

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    open(request: CallRequest): 'joined' | 'started' {
      if (snapshot !== undefined && sameCall(snapshot.request, request)) {
        if (!snapshot.expanded) set({ ...snapshot, expanded: true });
        return 'joined';
      }
      current()?.hangup();
      controls = undefined;
      next += 1;
      set({
        key: next,
        request,
        expanded: true,
        attempt: 0,
        state: { status: 'idle' },
        interrupted: false,
        supported: true,
        audioRoutes: false,
      });
      return 'started';
    },
    minimize(key: number) {
      if (snapshot?.key !== key || !snapshot.expanded) return;
      if (
        snapshot.state.status === 'ended' ||
        !snapshot.supported ||
        snapshot.microphone !== 'granted'
      ) {
        current()?.hangup();
        controls = undefined;
        set(undefined);
        return;
      }
      set({ ...snapshot, expanded: false });
    },
    close(key: number) {
      if (snapshot?.key !== key) return;
      current()?.hangup();
      controls = undefined;
      set(undefined);
    },
    retry(key: number) {
      if (snapshot?.key !== key) return;
      set({
        ...snapshot,
        attempt: snapshot.attempt + 1,
        state: { status: 'idle' },
        startedAt: undefined,
        microphone: undefined,
        interrupted: false,
      });
    },
    publish(key: number, patch: CallSessionPatch) {
      if (snapshot?.key !== key) return;
      set({ ...snapshot, ...patch });
    },
    attach(key: number, value: CallControls) {
      if (snapshot?.key !== key) return () => undefined;
      const entry = { key, value };
      controls = entry;
      return () => {
        if (controls === entry) controls = undefined;
      };
    },
    controls: current,
  };
}

export type CallSessions = ReturnType<typeof createCallSessions>;

export const callSessions = createCallSessions();
