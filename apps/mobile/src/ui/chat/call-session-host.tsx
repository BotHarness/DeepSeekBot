import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState, View } from 'react-native';

import type { CallClientState } from '../../../../../packages/core/src/voice/call-client';
import { createCallSession } from '../../../../../packages/core/src/voice/call-session';
import { callLiveView } from '../../../../../packages/core/src/voice/call-view';
import { createCallPost } from '../../host/call-post';
import { createPhoneCallCamera, type CallCameraPosition } from '../../host/call-camera';
import { createCallMedia, microphoneAccess, microphoneGranted } from '../../host/call-media';
import { askCallNotifications, callOverlayAllowed } from '../../host/call-notice';
import { retainHostConnection, useHostSession, useHostSnapshot } from '../../host/host-session';
import { callActivityNative, onCallActivityAction } from '../../host/native-call-activity';
import {
  callActivityBadges,
  callAvatarUri,
  type CallActivityBadges,
} from '../../host/native-call-activity-images';
import { callAudioPreference } from '../../host/native-call-audio-route';
import { humanBubbleColors } from '../../../../../packages/client/src/client/bot-name-color';
import { botColor } from '../bot-color';
import { useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { locale } from '../strings';
import { createCallActivity, type CallActivityPalette } from './call-activity';
import { CallBubble } from './call-bubble';
import { createPhoneCameraShare, phoneCameraState } from './call-camera-share';
import { callActivityPhase } from './call-model';
import {
  CALL_CAMERA_OFF,
  callSessions,
  type CallCameraState,
  type CallSessionSnapshot,
} from './call-session';

const testBuild = () =>
  typeof __DEV__ !== 'undefined' && __DEV__ && Application.applicationId?.endsWith('.dev') === true;

type ScriptStep = {
  at: number;
  url?: string;
  video?: string;
  camera?: 'off' | 'flip';
};

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
  const { client, saved } = useHostSession(request.hostId);
  const hostRef = useRef<string | undefined>(undefined);
  hostRef.current = saved?.hostId;
  const snapshot = useHostSnapshot(client);
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const name = bot?.displayName ?? slug;
  const nameRef = useRef(name);
  nameRef.current = name;
  const colorRef = useRef<{ fill: string; ink: string } | undefined>(undefined);
  colorRef.current = bot === undefined ? undefined : humanBubbleColors(botColor(bot), 'light');
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { color } = useDesignTheme();
  const palette: CallActivityPalette = {
    success: color.success,
    accent: color.accent,
    warning: color.warning,
    danger: color.danger,
    muted: color.muted,
    surface: color.surface,
    fg: color.fg,
    base: color.base,
  };
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
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
    let releaseConnection: (() => void) | undefined;
    const timeline: Record<string, unknown>[] = [];
    const mark = (kind: string, detail: Record<string, unknown> = {}) =>
      timeline.push({ kind, at: Date.now(), ...detail });
    const activity = createCallActivity(callActivityNative);
    let current: CallClientState = { status: 'idle' };
    let paused = false;
    let connectedAt: number | undefined;
    let reported = false;
    let badges: CallActivityBadges | undefined;
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
              palette: paletteRef.current,
              avatar:
                hostRef.current === undefined ? undefined : callAvatarUri(hostRef.current, slug),
              avatarColor: colorRef.current?.fill,
              avatarInk: colorRef.current?.ink,
              ...badges,
            },
      );
    };
    void callActivityBadges().then((value) => {
      if (cancelled || value === undefined) return;
      badges = value;
      showActivity();
    });
    let cameraState: CallCameraState = CALL_CAMERA_OFF;
    let position: CallCameraPosition = 'front';
    const share = createPhoneCameraShare(() => camera);
    const call = createCallSession({
      post: createCallPost(client),
      media,
      emit: 'visible-changes',
      capture: share.capture,
      onChange: ({ call: next, visual }) => {
        if (cancelled) return;
        const nextCamera = phoneCameraState(visual, position);
        const cameraChanged = JSON.stringify(nextCamera) !== JSON.stringify(cameraState);
        cameraState = nextCamera;
        if (next === current) {
          if (cameraChanged) callSessions.publish(key, { camera: cameraState });
          return;
        }
        current = next;
        const view = callLiveView(next);
        if (view?.connected === true) connectedAt ??= Date.now() - view.durationMs;
        if (next.status === 'ended') {
          releaseConnection?.();
          releaseConnection = undefined;
          paused = false;
        }
        callSessions.publish(key, {
          state: next,
          ...(cameraChanged ? { camera: cameraState } : {}),
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
        if (testAudio && !cancelled)
          mark('keyframe', { bytes: frame.bytes, prepareMs: frame.prepareMs });
        await share.keyframe(frame);
      },
      onPause: (next) => {
        if (testAudio && !cancelled) mark('camera', { paused: next });
        share.pause(next);
      },
    });
    callSessions.publish(key, { cameraSupported: camera !== undefined });
    const turnCamera = async (on: boolean, next: CallCameraPosition, testVideo?: string) => {
      if (camera === undefined) return;
      if (!on) {
        await call.unshare('camera');
        return;
      }
      share.aim(next, testVideo);
      const shared = await call.share('camera', { restart: cameraState.on });
      if (!shared || cancelled) return;
      position = next;
      cameraState = { ...cameraState, position };
      callSessions.publish(key, { camera: cameraState });
      if (testAudio) mark('camera', { on: true, position, test: testVideo !== undefined });
    };
    const detach = callSessions.attach(key, {
      mute: (muted) => void call.client.mute(muted),
      hangup: () => void call.hangup(),
      choose: async (output, microphone) => (await media.audio?.choose(output, microphone)) ?? null,
      ...(media.audio?.mode
        ? {
            mode: async (music: boolean) => (await media.audio?.mode?.(music)) ?? null,
          }
        : {}),
      ...(media.audio?.volume ? { volume: (level: number) => media.audio?.volume?.(level) } : {}),
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
    call.client.background(AppState.currentState === 'background');
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && next !== 'background') return;
      call.client.background(next === 'background');
      if (testAudio) mark('app-state', { state: next });
    });
    const removeActions = onCallActivityAction((action) => {
      if (cancelled) return;
      if (testAudio) mark('activity-action', { action });
      if (action === 'hang-up') void call.hangup();
      else if (action === 'open') {
        if (callSessions.getSnapshot()?.expanded !== true)
          routerRef.current.push({
            pathname: '/call/[slug]',
            params: {
              slug,
              ...(request.hostId === undefined ? {} : { hostId: request.hostId }),
            },
          });
      } else if (current.status === 'live') void call.client.mute(!current.muted);
    });
    void (async () => {
      const access = await microphoneAccess();
      if (cancelled) return;
      callSessions.publish(key, { microphone: access });
      if (access !== 'granted') return;
      await callAudioPreference.ready;
      if (cancelled) return;
      releaseConnection = retainHostConnection(client);
      await call.client.open(slug);
      const opened = await media.audio?.state();
      if (!cancelled && opened !== undefined && opened !== null)
        callSessions.publish(key, { audioRoute: opened });
      const notifications = await askCallNotifications();
      if (!cancelled && notifications !== undefined) callSessions.publish(key, { notifications });
      if (cancelled || !testAudio || media.test === undefined || script === undefined) return;
      try {
        const steps = (await (await fetch(script)).json()) as ScriptStep[];
        const started = Date.now();
        for (const step of steps.slice(0, 20)) {
          const source = step.url ?? step.video;
          const local =
            source === undefined
              ? undefined
              : await File.downloadFileAsync(source, Paths.cache, {
                  idempotent: true,
                });
          const wait = started + step.at - Date.now();
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          if (cancelled) return;
          if (step.video !== undefined && local !== undefined) {
            await turnCamera(true, cameraState.position, local.uri);
            mark('video', {
              url: step.video,
              on: cameraState.on,
              error: cameraState.error,
            });
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
      detach();
      removeTap?.();
      removeAudio?.();
      removeActions();
      appState.remove();
      activity.end();
      call.dispose();
      releaseConnection?.();
      releaseConnection = undefined;
      cancelled = true;
      writeReport();
    };
  }, [client, media, key, slug, script, testAudio, request.hostId]);

  const overlay = useMounted(() => {
    const check = () => {
      const allowed = callOverlayAllowed();
      if (allowed !== undefined) callSessions.publish(key, { overlay: allowed });
    };
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => subscription.remove();
  }, [key]);

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
      <View ref={overlay} pointerEvents="none" style={{ display: 'none' }} />
    </>
  );
}
