import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState, View } from 'react-native';

import {
  createCallClient,
  type CallClientState,
  type CallPost,
} from '../../../../../packages/core/src/voice/call-client';
import { VOICE_CALL_PATH } from '../../../../../packages/core/src/voice/call-contract';
import {
  PhoneCallCameraFailure,
  createPhoneCallCamera,
  type CallCameraPosition,
} from '../../host/call-camera';
import { createCallMedia, microphoneAccess, microphoneGranted } from '../../host/call-media';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { callActivityNative, onCallActivityAction } from '../../host/native-call-activity';
import { callAudioPreference } from '../../host/native-call-audio-route';
import { useMounted } from '../mounted';
import { locale } from '../strings';
import { createCallActivity } from './call-activity';
import { CallBubble } from './call-bubble';
import { callActivityPhase } from './call-model';
import {
  CALL_CAMERA_OFF,
  callSessions,
  type CallCameraState,
  type CallSessionSnapshot,
} from './call-session';

const testBuild = () =>
  typeof __DEV__ !== 'undefined' && __DEV__ && Application.applicationId?.endsWith('.dev') === true;

type ScriptStep = { at: number; url?: string; video?: string; camera?: 'off' | 'flip' };

function hostPost(api: ReturnType<typeof useHostSession>['client']): CallPost {
  return async (body) => {
    if (api === undefined) throw new Error('No Host connection.');
    const answer = await api.api(VOICE_CALL_PATH, { body });
    const result = answer.body as { ok?: unknown } | null;
    if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean')
      throw new Error(`The Host answered ${answer.status}.`);
    return result as Awaited<ReturnType<CallPost>>;
  };
}

export function useCallSession(): CallSessionSnapshot | undefined {
  return useSyncExternalStore(callSessions.subscribe, callSessions.getSnapshot);
}

export function CallSessionHost() {
  const session = useCallSession();
  if (session === undefined) return null;
  return (
    <>
      <CallRunner key={`${session.key}:${session.attempt}`} session={session} />
      {session.expanded ? null : <CallBubble session={session} />}
    </>
  );
}

function CallRunner({ session }: { session: CallSessionSnapshot }) {
  const { key, request } = session;
  const { slug, script } = request;
  const { client } = useHostSession(request.hostId);
  const snapshot = useHostSnapshot(client);
  const name = snapshot.roster?.bots.find((entry) => entry.slug === slug)?.displayName ?? slug;
  const nameRef = useRef(name);
  nameRef.current = name;
  const testAudio = testBuild() && script !== undefined;
  const media = useMemo(
    () =>
      createCallMedia({
        testAudio,
        audio: () => callAudioPreference.getSnapshot().audio,
      }),
    [testAudio],
  );
  const dialed = useRef(false);

  const capabilities = useMounted(() => {
    callSessions.publish(key, {
      supported: media !== undefined,
      audioRoutes: media?.audio !== undefined,
    });
  }, [key, media]);

  const dial = useMounted(() => {
    if (client === undefined || media === undefined || dialed.current) return;
    dialed.current = true;
    let cancelled = false;
    const timeline: Record<string, unknown>[] = [];
    const mark = (kind: string, detail: Record<string, unknown> = {}) =>
      timeline.push({ kind, at: Date.now(), ...detail });
    const activity = createCallActivity(callActivityNative);
    let current: CallClientState = { status: 'idle' };
    let paused = false;
    let connectedAt: number | undefined;
    let reported = false;
    const writeReport = () => {
      if (!testAudio || reported) return;
      reported = true;
      const file = new File(Paths.cache, `call-report-${Date.now()}.json`);
      setTimeout(() => {
        try {
          file.writeSync(
            JSON.stringify({
              timeline,
              recording: media.test?.recording() ?? null,
            }),
          );
          callSessions.publish(key, { report: file.uri });
        } catch {
          callSessions.publish(key, { report: undefined });
        }
      }, 500);
    };
    const showActivity = () => {
      const phase = callActivityPhase(current, paused);
      activity.sync(
        phase === undefined
          ? undefined
          : {
              name: nameRef.current,
              phase,
              startedAt: connectedAt ?? Date.now(),
              muted: current.status === 'live' && current.muted,
              locale: locale === 'zh' ? 'zh' : 'en',
            },
      );
    };
    let cameraState: CallCameraState = CALL_CAMERA_OFF;
    const setCamera = (patch: Partial<CallCameraState>) => {
      cameraState = { ...cameraState, ...patch };
      if (!cancelled) callSessions.publish(key, { camera: cameraState });
    };
    let stopCamera = () => undefined as void;
    const call = createCallClient({
      post: hostPost(client),
      media,
      onChange: (next) => {
        if (cancelled) return;
        current = next;
        if (next.status === 'live') connectedAt ??= Date.now();
        if (next.status === 'ended') {
          paused = false;
          if (cameraState.on) {
            stopCamera();
            cameraState = CALL_CAMERA_OFF;
            callSessions.publish(key, { camera: cameraState });
          }
        }
        callSessions.publish(key, {
          state: next,
          ...(connectedAt === undefined ? {} : { startedAt: connectedAt }),
          ...(next.status === 'ended' ? { interrupted: false } : {}),
        });
        showActivity();
        if (testAudio)
          mark('state', {
            status: next.status,
            phase: next.status === 'live' ? next.call.phase : undefined,
          });
        if (next.status === 'ended') writeReport();
      },
    });
    const camera = createPhoneCallCamera({
      onKeyframe: async (frame) => {
        if (cancelled || !cameraState.on) return;
        setCamera({ keyframes: cameraState.keyframes + 1, keyframeAt: Date.now() });
        if (testAudio) mark('keyframe', { bytes: frame.bytes, prepareMs: frame.prepareMs });
        await call.frame(frame);
      },
      onPause: (paused) => {
        if (cancelled || !cameraState.on || cameraState.paused === paused) return;
        setCamera({ paused });
        if (testAudio) mark('camera', { paused });
        void call.visual(paused ? 'off' : 'camera', true, paused ? 'paused' : 'resumed');
      },
    });
    callSessions.publish(key, { cameraSupported: camera !== undefined });
    stopCamera = () => camera?.stop();
    const turnCamera = async (on: boolean, position: CallCameraPosition, testVideo?: string) => {
      if (camera === undefined || current.status !== 'live' || cameraState.starting) return;
      if (!on) {
        if (!cameraState.on) return;
        camera.stop();
        setCamera({ on: false, paused: false });
        await call.visual('off');
        return;
      }
      setCamera({ starting: true, error: undefined });
      const accepted = cameraState.on ? undefined : await call.visual('camera');
      if (accepted !== undefined && !accepted.ok) {
        setCamera({ starting: false });
        return;
      }
      try {
        await camera.start(position, testVideo);
      } catch (error) {
        camera.stop();
        setCamera({
          ...CALL_CAMERA_OFF,
          error: error instanceof PhoneCallCameraFailure ? error.code : 'camera-missing',
        });
        await call.visual('off');
        return;
      }
      if (cancelled) {
        camera.stop();
        return;
      }
      setCamera({
        on: true,
        starting: false,
        paused: false,
        position,
        ...(cameraState.on ? {} : { keyframes: 0, keyframeAt: undefined }),
      });
      if (testAudio) mark('camera', { on: true, position, test: testVideo !== undefined });
    };
    const detach = callSessions.attach(key, {
      mute: (muted) => void call.mute(muted),
      hangup: () => void call.hangup(),
      choose: async (output, microphone) => (await media.audio?.choose(output, microphone)) ?? null,
      camera: (on) => void turnCamera(on, cameraState.position),
      flip: () => {
        if (cameraState.on)
          void turnCamera(true, cameraState.position === 'front' ? 'back' : 'front');
      },
    });
    const removeTap = media.test?.onTap((event) => mark('native', event));
    const removeAudio = media.audio?.onChange((event) => {
      if (cancelled) return;
      paused = event.interrupted;
      callSessions.publish(key, {
        interrupted: event.interrupted,
        ...(event.route === undefined ? {} : { audioRoute: event.route }),
      });
      showActivity();
      if (testAudio) mark('audio', event);
    });
    const removeActions = onCallActivityAction((action) => {
      if (cancelled) return;
      if (testAudio) mark('activity-action', { action });
      if (action === 'hang-up') void call.hangup();
      else if (current.status === 'live') void call.mute(!current.muted);
    });
    void (async () => {
      const access = await microphoneAccess();
      if (cancelled) return;
      callSessions.publish(key, { microphone: access });
      if (access !== 'granted') return;
      await callAudioPreference.ready;
      if (cancelled) return;
      await call.open(slug);
      const opened = await media.audio?.state();
      if (!cancelled && opened !== undefined && opened !== null)
        callSessions.publish(key, { audioRoute: opened });
      if (cancelled || !testAudio || media.test === undefined || script === undefined) return;
      try {
        const steps = (await (await fetch(script)).json()) as ScriptStep[];
        const started = Date.now();
        for (const step of steps.slice(0, 20)) {
          const source = step.url ?? step.video;
          const local =
            source === undefined
              ? undefined
              : await File.downloadFileAsync(source, Paths.cache, { idempotent: true });
          const wait = started + step.at - Date.now();
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          if (cancelled) return;
          if (step.video !== undefined && local !== undefined) {
            await turnCamera(true, cameraState.position, local.uri);
            mark('video', { url: step.video, on: cameraState.on, error: cameraState.error });
          } else if (step.camera === 'off') await turnCamera(false, cameraState.position);
          else if (step.camera === 'flip')
            await turnCamera(true, cameraState.position === 'front' ? 'back' : 'front');
          else if (step.url !== undefined && local !== undefined)
            mark('inject', {
              url: step.url,
              ok: await media.test.inject(local.uri),
            });
        }
      } catch (error) {
        mark('script-failed', { error: String(error) });
      }
    })();
    return () => {
      camera?.stop();
      detach();
      removeTap?.();
      removeAudio?.();
      removeActions();
      activity.end();
      call.dispose();
      cancelled = true;
      writeReport();
    };
  }, [client, media, key, slug, script, testAudio]);

  const waitingForMicrophone = session.microphone === 'denied' || session.microphone === 'blocked';
  const recover = useMounted(() => {
    if (!waitingForMicrophone) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void microphoneGranted().then((granted) => {
        if (granted) callSessions.retry(key);
      });
    });
    return () => subscription.remove();
  }, [waitingForMicrophone, key]);

  return (
    <>
      <View ref={capabilities} pointerEvents="none" style={{ display: 'none' }} />
      <View ref={dial} pointerEvents="none" style={{ display: 'none' }} />
      <View ref={recover} pointerEvents="none" style={{ display: 'none' }} />
    </>
  );
}
