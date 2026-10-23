import {
  Button as ComposeButton,
  Host,
  Text as ComposeText,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore, type ComponentType } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createLocalVideoClient,
  type LocalVideoClientState,
} from '../../../../../packages/computer/src/local-video-client';
import { videoPointerClick } from '../../host/local-video-pointer';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { localVideoActions, watchLocalVideoForeground } from '../../host/local-video-actions';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { NativeLocalComputerVideo } from './local-computer-video.android';
import { ComputerVideoStage } from './computer-video-stage';

const idle: LocalVideoClientState = {
  status: 'idle',
  host: undefined,
  presenting: false,
  busy: false,
  code: undefined,
};

export function LocalComputerScreen({ Legacy }: { Legacy: ComponentType }) {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const viewer = useMemo(
    () =>
      client === undefined
        ? undefined
        : createLocalVideoClient(client, {
            mediaAvailable: NativeLocalComputerVideo !== undefined,
          }),
    [client, slug],
  );
  const state = useSyncExternalStore(
    (listener) => viewer?.subscribe(listener) ?? (() => {}),
    () => viewer?.getState() ?? idle,
  );
  const cursor = useSharedValue({ x: 0, y: 0 });
  const revoked = snapshot.connection.status === 'refused';
  const connected = snapshot.connection.status === 'connected';
  const nativeMissing = NativeLocalComputerVideo === undefined;
  useFocusEffect(
    useCallback(() => {
      if (viewer === undefined || !connected) return;
      return watchLocalVideoForeground(viewer, AppState.currentState === 'active', (listener) => {
        const subscription = AppState.addEventListener('change', (next) =>
          listener(next === 'active'),
        );
        return () => subscription.remove();
      });
    }, [viewer, connected]),
  );

  if (state.status === 'unsupported') return <Legacy />;
  const host = state.host;
  const actions = localVideoActions(state);
  const binding = host?.binding;
  const mediaMounted =
    !revoked &&
    !nativeMissing &&
    binding !== undefined &&
    host?.offer !== undefined &&
    connected &&
    (state.status === 'observing' || state.status === 'controlling');
  const driving =
    mediaMounted &&
    state.status === 'controlling' &&
    state.presenting &&
    host?.media.status === 'live' &&
    !state.busy;
  const frame = { width: host?.media.width ?? 0, height: host?.media.height ?? 0 };
  const Video = NativeLocalComputerVideo;
  const click = (at: { x: number; y: number }, button: 'left' | 'right') => {
    const current = viewer?.getState().host;
    if (
      current?.binding?.runtimeId !== binding?.runtimeId ||
      current?.binding?.viewerId !== binding?.viewerId ||
      current?.binding?.attemptId !== binding?.attemptId ||
      current?.grant?.generation !== host?.grant?.generation
    )
      return;
    const input = videoPointerClick({ point: at, frame, button, driving });
    if (input !== undefined) void viewer?.input(input);
  };
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const close = () => {
    void viewer?.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const message = revoked
    ? t.browserRevoked
    : nativeMissing
      ? t.computerVideoBuildRequired
      : state.code === 'viewer-limit'
        ? t.computerVideoViewerLimit
        : state.code === 'connect-carrier-required'
          ? t.computerVideoCarrierRequired
          : state.code === 'input-result-unknown'
            ? t.computerVideoInputUnknown
            : state.status === 'unavailable'
              ? t.computerVideoUnavailable
              : host?.media.status === 'stalled' ||
                  state.code === 'media-not-live' ||
                  (mediaMounted && !state.presenting)
                ? t.computerVideoWaiting
                : undefined;
  const action = (
    label: string,
    testID: string,
    onClick: () => void,
    disabled = false,
    primary = false,
  ) => {
    const Control = primary ? ComposeButton : TextButton;
    return (
      <View testID={testID}>
        <Host
          matchContents={{ vertical: true }}
          style={{ width: '100%' }}
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
        >
          <Control enabled={!disabled} onClick={onClick} modifiers={[fillMaxWidth()]}>
            <ComposeText>{label}</ComposeText>
          </Control>
        </Host>
      </View>
    );
  };

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: theme.layer.canvas.fill,
      }}
    >
      <View style={{ paddingHorizontal: space.x5, paddingVertical: space.x3 }}>
        <Text variant="title">{t.computerTitle(bot?.displayName ?? slug ?? '')}</Text>
        <Text accessibilityLiveRegion="polite" variant="meta" tone={driving ? 'accent' : 'muted'}>
          {driving ? t.computerYouDriving : t.computerWatching}
          {host?.paused ? ` · ${t.computerVideoBotsPaused}` : ''}
        </Text>
      </View>
      <View style={{ flex: 1, minHeight: theme.touch * 3 }}>
        {mediaMounted && Video !== undefined ? (
          <ComputerVideoStage
            key={binding.attemptId}
            frame={frame}
            driving={driving}
            cursor={cursor}
            onClick={click}
          >
            {(size) => (
              <Video
                key={binding.attemptId}
                attemptId={binding.attemptId}
                offer={host.offer!.sdp}
                enabled
                testID="computer-video-surface"
                accessibilityLabel={t.computerVideoSurface}
                style={{ width: size.width, height: size.height }}
                onDescription={({ nativeEvent }) =>
                  void viewer?.answer(nativeEvent.attemptId, nativeEvent.sdp)
                }
                onPresentation={({ nativeEvent }) =>
                  viewer?.playback(
                    nativeEvent.attemptId,
                    nativeEvent.presentedFrames,
                    nativeEvent.lastPresentedAgoMs,
                  )
                }
                onMediaState={({ nativeEvent }) => {
                  if (nativeEvent.state === 'failed' || nativeEvent.state === 'closed')
                    viewer?.mediaFailed(nativeEvent.attemptId, nativeEvent.code);
                }}
              />
            )}
          </ComputerVideoStage>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {state.status === 'opening' && !nativeMissing ? <LoadingIndicator /> : null}
          </View>
        )}
      </View>
      <ScrollView
        style={{ flexGrow: 0, maxHeight: '45%' }}
        contentContainerStyle={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}
      >
        <Text variant="meta" tone="muted">
          {t.computerVideoTrackpadHint}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
          <View style={{ flexBasis: '45%', flexGrow: 1 }}>
            {action(
              t.computerLeftClick,
              'computer-video-left-click',
              () => click(cursor.get(), 'left'),
              !driving,
            )}
          </View>
          <View style={{ flexBasis: '45%', flexGrow: 1 }}>
            {action(
              t.computerRightClick,
              'computer-video-right-click',
              () => click(cursor.get(), 'right'),
              !driving,
            )}
          </View>
        </View>
        {message === undefined ? null : (
          <Text accessibilityLiveRegion="polite" tone="muted">
            {message}
          </Text>
        )}
        {actions.release
          ? action(
              t.computerVideoRelease,
              'computer-video-release',
              () => void viewer?.release(),
              state.busy || revoked || !connected,
            )
          : action(
              t.computerVideoTakeover,
              'computer-video-takeover',
              () => void viewer?.takeover(),
              !mediaMounted ||
                !state.presenting ||
                host?.media.status !== 'live' ||
                !host.media.captureAlive ||
                state.busy,
              true,
            )}
        {host?.paused
          ? action(
              t.computerVideoResume,
              'computer-video-resume',
              () => void viewer?.resume(),
              state.busy || revoked,
            )
          : null}
        {!nativeMissing && !revoked && connected && actions.reconnect
          ? action(
              t.computerVideoReconnect,
              'computer-video-reconnect',
              () => {
                void viewer?.reconnect();
              },
              state.busy,
            )
          : null}
        {action(t.computerClose, 'computer-video-close', close)}
      </ScrollView>
    </View>
  );
}
