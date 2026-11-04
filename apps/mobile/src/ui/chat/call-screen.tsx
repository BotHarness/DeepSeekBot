import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fallbackCallAudioRoute,
  type CallAudioOutputId,
  type CallMicrophoneId,
} from '../../host/call-audio-route';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { callAudioPreference } from '../../host/native-call-audio-route';
import { BotAvatar } from '../bot-avatar';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { CallAudioMenu } from './call-audio-menu';
import { CallCameraPreview } from './call-camera-preview';
import { callAudioDeviceName } from './call-audio-symbol';
import { callScreenModel, formatCallDuration, microphoneRecovery } from './call-model';
import { callSessions, sameCall } from './call-session';
import { useCallSession } from './call-session-host';

const symbols = {
  mic: { ios: 'mic.fill', android: 'mic' },
  micOff: { ios: 'mic.slash.fill', android: 'mic_off' },
  hangUp: { ios: 'phone.down.fill', android: 'call_end' },
  camera: { ios: 'video.fill', android: 'videocam' },
  cameraOff: { ios: 'video.slash.fill', android: 'videocam_off' },
  flip: { ios: 'arrow.triangle.2.circlepath.camera', android: 'flip_camera_ios' },
  minimize: {
    ios: 'arrow.down.right.and.arrow.up.left',
    android: 'close_fullscreen',
  },
} as const;

export function CallScreen({
  slug,
  hostId,
  script,
}: {
  slug: string;
  hostId?: string | undefined;
  script?: string | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useHostSession(hostId);
  const snapshot = useHostSnapshot(client);
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const current = useCallSession();
  const session =
    current !== undefined && sameCall(current.request, { slug, hostId }) ? current : undefined;
  const key = session?.key;
  const [now, setNow] = useState(Date.now());
  const [audioFailed, setAudioFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      callSessions.open({ slug, hostId, script });
      const showing = callSessions.getSnapshot()?.key;
      return () => {
        if (showing !== undefined) callSessions.minimize(showing);
      };
    }, [slug, hostId, script]),
  );

  const state = session?.state ?? { status: 'idle' as const };
  const ticking = state.status === 'live';
  useFocusEffect(
    useCallback(() => {
      if (!ticking) return;
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), 1_000);
      return () => clearInterval(timer);
    }, [ticking]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!audioFailed) return;
      const timer = setTimeout(() => setAudioFailed(false), 4_000);
      return () => clearTimeout(timer);
    }, [audioFailed]),
  );

  const microphone = session?.microphone;
  const model = callScreenModel(t, state, {
    interrupted: session?.interrupted === true,
  });
  const recovery = microphoneRecovery(t, microphone);
  const camera = session?.camera;
  const cameraOn = camera?.on === true;
  const cameraError =
    camera?.error === 'camera-denied'
      ? t.call.cameraDenied
      : camera?.error === 'camera-missing'
        ? t.call.cameraMissing
        : undefined;
  const hint = audioFailed ? t.call.audioSwitchFailed : (cameraError ?? model.hint);
  const control = () => (key === undefined ? undefined : callSessions.controls());
  const shownRoute = session?.audioRoute ?? fallbackCallAudioRoute();
  const chooseAudio = (output: CallAudioOutputId, microphone: CallMicrophoneId) => {
    const choosing = control();
    if (choosing === undefined || key === undefined) return;
    void choosing.choose(output, microphone).then((next) => {
      if (next === null) {
        setAudioFailed(true);
        return;
      }
      setAudioFailed(false);
      callSessions.publish(key, { audioRoute: next });
      if (next.output === 'external') callAudioPreference.setHeadsetMicrophone(next.microphone);
    });
  };
  const leave = () => {
    if (router.canGoBack()) router.back();
    else
      router.replace({
        pathname: '/dm/[slug]',
        params: { slug, ...(hostId === undefined ? {} : { hostId }) },
      });
  };
  const close = () => {
    if (key !== undefined) callSessions.close(key);
    leave();
  };
  const startedAt = session?.startedAt;
  const duration = startedAt === undefined ? undefined : formatCallDuration(now - startedAt);
  const unsupported = session?.supported === false;
  const ended = unsupported ? t.call.phoneUnsupported : (recovery?.message ?? model.ended);
  const report = session?.report;

  const round = theme.touch * 1.5;
  const roundButton = (input: {
    label: string;
    testID: string;
    symbol: (typeof symbols)[keyof typeof symbols];
    fill: string;
    ink: string;
    onPress(): void;
    selected?: boolean;
    disabled?: boolean;
  }) => (
    <View style={{ alignItems: 'center', gap: space.x3 }}>
      <Pressable
        testID={input.testID}
        accessibilityRole="button"
        accessibilityLabel={input.label}
        accessibilityState={{
          selected: input.selected === true,
          disabled: input.disabled === true,
        }}
        disabled={input.disabled}
        onPress={input.onPress}
        style={({ pressed }) => ({
          width: round,
          height: round,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: input.fill,
          opacity: input.disabled === true ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <SystemSymbol name={input.symbol} size={theme.type.title.line} color={input.ink} />
      </Pressable>
      <Text variant="meta" tone="muted">
        {input.label}
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View
        testID="call-screen"
        style={{
          flex: 1,
          backgroundColor: theme.color.base,
          paddingTop: insets.top + space.x6 * 2,
          paddingBottom: insets.bottom + space.x6,
          paddingHorizontal: space.x6,
          justifyContent: 'space-between',
        }}
      >
        {ended !== undefined ? null : (
          <Pressable
            testID="call-minimize"
            accessibilityRole="button"
            accessibilityLabel={t.call.minimize}
            hitSlop={space.x2}
            onPress={leave}
            style={({ pressed }) => ({
              position: 'absolute',
              zIndex: 1,
              top: insets.top + space.x3,
              left: space.x4,
              width: theme.touch,
              height: theme.touch,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <SystemSymbol
              name={symbols.minimize}
              size={theme.type.body.line}
              color={theme.color.fg}
            />
          </Pressable>
        )}
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ alignItems: 'center', gap: space.x4 }}
        >
          {cameraOn && ended === undefined ? (
            <View style={{ alignItems: 'center', gap: space.x3 }}>
              <View
                testID="call-camera-preview"
                accessible
                accessibilityLabel={t.call.cameraPreview}
                style={{
                  width: theme.touch * 4.5,
                  aspectRatio: 3 / 4,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  backgroundColor: theme.color.surface,
                }}
              >
                <CallCameraPreview style={{ flex: 1 }} />
                <Pressable
                  testID="call-camera-flip"
                  accessibilityRole="button"
                  accessibilityLabel={t.call.cameraFlip}
                  hitSlop={space.x2}
                  onPress={() => control()?.flip()}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    right: space.x3,
                    bottom: space.x3,
                    width: theme.touch,
                    height: theme.touch,
                    borderRadius: radius.round,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.color.base,
                    opacity: pressed ? 0.7 : 0.9,
                  })}
                >
                  <SystemSymbol
                    name={symbols.flip}
                    size={theme.type.body.line}
                    color={theme.color.fg}
                  />
                </Pressable>
              </View>
              <Text
                testID="call-camera-keyframes"
                variant="meta"
                tone="muted"
                accessibilityLiveRegion="polite"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {camera.keyframes > 0
                  ? t.call.cameraKeyframes(camera.keyframes)
                  : t.call.cameraWaiting}
              </Text>
            </View>
          ) : bot === undefined ? null : (
            <BotAvatar bot={bot} size={theme.touch * 2.5} />
          )}
          <Text variant="display" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {bot?.displayName ?? slug}
          </Text>
          <Text
            testID="call-status"
            variant="body"
            tone="muted"
            accessibilityLiveRegion="polite"
            style={{ textAlign: 'center' }}
          >
            {ended ?? model.status}
          </Text>
          {duration === undefined || !model.live ? null : (
            <Text
              testID="call-duration"
              variant="meta"
              tone="subtle"
              accessibilityLabel={t.call.duration(duration)}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {duration}
            </Text>
          )}
          {model.heard === undefined || ended !== undefined ? null : (
            <Text
              testID="call-heard"
              variant="body"
              tone={model.heard.final ? 'fg' : 'subtle'}
              numberOfLines={4}
              accessibilityLiveRegion="polite"
              accessibilityLabel={t.call.heard(model.heard.text)}
              style={{ textAlign: 'center', marginTop: space.x4 }}
            >
              {model.heard.text}
            </Text>
          )}
          {hint === undefined ? null : (
            <View
              testID="call-hint"
              style={{
                marginTop: space.x4,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
                borderRadius: radius.lg,
                backgroundColor: theme.color.warningSoft,
              }}
            >
              <Text variant="meta" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
                {hint}
              </Text>
            </View>
          )}
          {report === undefined ? null : (
            <Text testID="call-test-report" variant="meta" tone="subtle" selectable>
              {report}
            </Text>
          )}
        </ScrollView>
        {ended !== undefined ? (
          <View style={{ gap: space.x4 }}>
            {recovery?.action === 'settings' ? (
              <Button
                testID="call-open-settings"
                label={t.call.openSettings}
                tone="primary"
                onPress={() => void Linking.openSettings()}
              />
            ) : recovery?.action === 'ask' ? (
              <Button
                testID="call-allow-microphone"
                label={t.call.allowMicrophone}
                tone="primary"
                onPress={() => {
                  if (key !== undefined) callSessions.retry(key);
                }}
              />
            ) : model.retry && !unsupported && microphone === 'granted' ? (
              <Button
                testID="call-again"
                label={t.call.callAgain}
                tone="primary"
                onPress={() => {
                  if (key !== undefined) callSessions.retry(key);
                }}
              />
            ) : null}
            <Button testID="call-close" label={t.call.close} onPress={leave} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
            {roundButton({
              label: model.muted ? t.call.unmute : t.call.mute,
              testID: 'call-mute',
              symbol: model.muted ? symbols.micOff : symbols.mic,
              fill: model.muted ? theme.color.fg : theme.color.surface,
              ink: model.muted ? theme.color.base : theme.color.fg,
              selected: model.muted,
              disabled: !model.live,
              onPress: () => control()?.mute(!model.muted),
            })}
            {session?.cameraSupported !== true
              ? null
              : roundButton({
                  label: t.call.camera,
                  testID: 'call-camera',
                  symbol: cameraOn ? symbols.camera : symbols.cameraOff,
                  fill: cameraOn ? theme.color.fg : theme.color.surface,
                  ink: cameraOn ? theme.color.base : theme.color.fg,
                  selected: cameraOn,
                  disabled: !model.live || camera?.starting === true,
                  onPress: () => control()?.camera(!cameraOn),
                })}
            {session?.audioRoutes !== true ? null : (
              <View style={{ alignItems: 'center', gap: space.x3 }}>
                <CallAudioMenu
                  route={shownRoute}
                  size={round}
                  fill={theme.color.surface}
                  ink={theme.color.fg}
                  disabled={!model.live}
                  onOutput={(output) => chooseAudio(output, shownRoute.microphone)}
                  onMicrophone={(microphone) => chooseAudio(shownRoute.output, microphone)}
                />
                <Text variant="meta" tone="muted">
                  {callAudioDeviceName(
                    t,
                    shownRoute.outputs.find((output) => output.id === shownRoute.output),
                  )}
                </Text>
              </View>
            )}
            {roundButton({
              label: t.call.hangUp,
              testID: 'call-hang-up',
              symbol: symbols.hangUp,
              fill: theme.color.danger,
              ink: theme.color.onDanger,
              onPress: close,
            })}
          </View>
        )}
      </View>
    </>
  );
}
