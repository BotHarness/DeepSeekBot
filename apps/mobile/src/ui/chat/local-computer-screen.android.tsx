import { Button as ComposeButton, Host, Text as ComposeText, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import { AppState, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createLocalVideoClient, type LocalVideoClientState } from '../../../../../packages/computer/src/local-video-client';
import { fittedFrame, pagePoint } from '../../host/browser-viewer';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { NativeLocalComputerVideo } from './local-computer-video.android';

const idle: LocalVideoClientState = {
  status: 'idle', host: undefined, presenting: false, busy: false, code: undefined,
};

/** T1 intentionally exposes direct click only. Touchpad/IME expansion follows first-slice feedback. */
export function LocalComputerScreen({ Legacy }: { Legacy: ComponentType }) {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const viewer = useMemo(() => client === undefined ? undefined : createLocalVideoClient(client, {
    mediaAvailable: NativeLocalComputerVideo !== undefined,
  }), [client, slug]);
  const state = useSyncExternalStore(
    (listener) => viewer?.subscribe(listener) ?? (() => {}),
    () => viewer?.getState() ?? idle,
  );
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const revoked = snapshot.connection.status === 'refused';
  const connected = snapshot.connection.status === 'connected';
  const nativeMissing = NativeLocalComputerVideo === undefined;
  useEffect(() => {
    if (viewer === undefined || !connected) return;
    if (AppState.currentState === 'active') void viewer.start();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void viewer.start();
      else void viewer.stop();
    });
    return () => { subscription.remove(); void viewer.stop(); };
  }, [viewer, connected]);

  // Only a positive, authenticated unsupported-platform result selects the pre-migration surface.
  // A missing route, failed helper, failed ICE or missing native module never selects images.
  if (state.status === 'unsupported') return <Legacy />;
  const host = state.host;
  const binding = host?.binding;
  const mediaMounted = !revoked && !nativeMissing && binding !== undefined && host?.offer !== undefined &&
    connected && (state.status === 'observing' || state.status === 'controlling');
  const driving = mediaMounted && state.status === 'controlling' && state.presenting &&
    host?.media.status === 'live' && !state.busy;
  const frame = { width: host?.media.width ?? 0, height: host?.media.height ?? 0 };
  const fit = fittedFrame(frame, stage);
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const close = () => {
    void viewer?.stop();
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const message = revoked ? t.browserRevoked : nativeMissing ? t.computerVideoBuildRequired :
    state.code === 'viewer-limit' ? t.computerVideoViewerLimit :
    state.code === 'connect-carrier-required' ? t.computerVideoCarrierRequired :
    state.code === 'input-result-unknown' ? t.computerVideoInputUnknown :
    state.status === 'unavailable' ? t.computerVideoUnavailable :
    state.code === 'media-not-live' || (mediaMounted && !state.presenting) ? t.computerVideoWaiting :
    undefined;
  const action = (label: string, testID: string, onClick: () => void, disabled = false, primary = false) => {
    const Control = primary ? ComposeButton : TextButton;
    return (
      <View testID={testID}>
        <Host matchContents={{ vertical: true }} style={{ width: '100%' }} colorScheme={theme.scheme} seedColor={theme.color.accent}>
          <Control enabled={!disabled} onClick={onClick} modifiers={[fillMaxWidth()]}>
            <ComposeText>{label}</ComposeText>
          </Control>
        </Host>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: theme.layer.canvas.fill }}>
      <View style={{ paddingHorizontal: space.x5, paddingVertical: space.x3 }}>
        <Text variant="title">{t.computerTitle(bot?.displayName ?? slug ?? '')}</Text>
        <Text accessibilityLiveRegion="polite" variant="meta" tone={driving ? 'accent' : 'muted'}>
          {driving ? t.computerYouDriving : t.computerWatching}
          {host?.paused ? ` · ${t.computerVideoBotsPaused}` : ''}
        </Text>
      </View>
      <View style={{ flex: 1, minHeight: theme.touch * 3 }} onLayout={({ nativeEvent }) => setStage(nativeEvent.layout)}>
        {mediaMounted && NativeLocalComputerVideo !== undefined ? (
          <>
            <NativeLocalComputerVideo
              key={binding.attemptId}
              attemptId={binding.attemptId}
              offer={host.offer!.sdp}
              enabled
              testID="computer-video-surface"
              accessibilityLabel={t.computerVideoSurface}
              style={{ position: 'absolute', ...fit }}
              onDescription={({ nativeEvent }) => void viewer?.answer(nativeEvent.attemptId, nativeEvent.sdp)}
              onPresentation={({ nativeEvent }) => viewer?.playback(nativeEvent.attemptId, nativeEvent.presentedFrames, nativeEvent.lastPresentedAgoMs)}
              onMediaState={({ nativeEvent }) => {
                if (nativeEvent.state === 'failed' || nativeEvent.state === 'closed')
                  viewer?.mediaFailed(nativeEvent.attemptId, nativeEvent.code);
              }}
            />
            <Pressable
              testID="computer-video-click"
              disabled={!driving}
              accessibilityRole="button"
              accessibilityLabel={t.computerVideoClick}
              accessibilityState={{ disabled: !driving }}
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
              onPress={({ nativeEvent }) => {
                const at = pagePoint({ x: nativeEvent.locationX, y: nativeEvent.locationY }, frame, stage, { scale: 1, x: 0, y: 0 });
                if (at !== undefined) void viewer?.input({ kind: 'click', ...at, button: 'left', count: 1 });
              }}
            />
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {state.status === 'opening' && !nativeMissing ? <LoadingIndicator /> : null}
          </View>
        )}
      </View>
      <ScrollView style={{ flexGrow: 0, maxHeight: '45%' }} contentContainerStyle={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}>
        {message === undefined ? null : <Text accessibilityLiveRegion="polite" tone="muted">{message}</Text>}
        {mediaMounted && host?.controller
          ? action(t.computerVideoRelease, 'computer-video-release', () => void viewer?.release(), state.busy)
          : action(t.computerVideoTakeover, 'computer-video-takeover', () => void viewer?.takeover(), !mediaMounted || !state.presenting || state.busy, true)}
        {host?.paused ? action(t.computerVideoResume, 'computer-video-resume', () => void viewer?.resume(), state.busy || revoked) : null}
        {!nativeMissing && !revoked && (state.status === 'unavailable' || state.status === 'idle')
          ? action(t.computerVideoReconnect, 'computer-video-reconnect', () => { void viewer?.stop().then(() => viewer.start()); }, state.busy)
          : null}
        {action(t.computerClose, 'computer-video-close', close)}
      </ScrollView>
    </View>
  );
}
