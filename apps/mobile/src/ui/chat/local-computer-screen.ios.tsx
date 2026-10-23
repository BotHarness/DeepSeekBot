import { Host } from '@expo/ui';
import { Button, Text as NativeText, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  disabled,
  font,
  frame as nativeFrame,
} from '@expo/ui/swift-ui/modifiers';
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
import type { StageZoom } from '../../host/browser-viewer';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { localVideoActions, watchLocalVideoForeground } from '../../host/local-video-actions';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { haptic } from '../haptics';
import { t } from '../strings';
import { NativeLocalComputerVideo } from './local-computer-video.ios';
import { ComputerVideoStage } from './computer-video-stage';
import { localVideoNotice } from './local-video-notice';

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
  const preview = useSharedValue<StageZoom>({ scale: 1, x: 0, y: 0 });
  const connected = snapshot.connection.status === 'connected';
  const nativeMissing = NativeLocalComputerVideo === undefined;
  useFocusEffect(
    useCallback(() => {
      if (!viewer || !connected) return;
      return watchLocalVideoForeground(viewer, AppState.currentState === 'active', (listener) => {
        const sub = AppState.addEventListener('change', (next) => listener(next === 'active'));
        return () => sub.remove();
      });
    }, [viewer, connected]),
  );
  if (state.status === 'unsupported') return <Legacy />;
  const host = state.host;
  const binding = host?.binding;
  const actions = localVideoActions({ state, connection: snapshot.connection });
  const mediaMounted =
    connected &&
    !nativeMissing &&
    binding !== undefined &&
    host?.offer !== undefined &&
    (state.status === 'observing' || state.status === 'controlling');
  const controlling = mediaMounted && state.status === 'controlling';
  const driving = controlling && state.presenting && host?.media.status === 'live' && !state.busy;
  const frame = { width: host?.media.width ?? 0, height: host?.media.height ?? 0 };
  const click = (point: { x: number; y: number }, button: 'left' | 'right') => {
    const current = viewer?.getState().host;
    if (
      current?.binding?.runtimeId !== binding?.runtimeId ||
      current?.binding?.attemptId !== binding?.attemptId ||
      current?.grant?.generation !== host?.grant?.generation
    )
      return;
    const input = videoPointerClick({ point, frame, button, driving });
    if (input) void viewer?.input(input);
  };
  const close = () => {
    void viewer?.stop();
    router.canGoBack() ? router.back() : router.replace('/');
  };
  const recover = () => {
    if (actions.recovery === 'pair') router.push('/pair');
    else if (actions.recovery === 'host') client?.retryNow();
    else if (actions.recovery === 'video') void viewer?.reconnect();
  };
  const toggleDisabled =
    state.busy ||
    !connected ||
    (!actions.handBack &&
      (!mediaMounted ||
        !state.presenting ||
        host?.media.status !== 'live' ||
        !host.media.captureAlive));
  const message = localVideoNotice({
    connection: snapshot.connection,
    state,
    nativeMissing,
    mediaMounted,
  });
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const Video = NativeLocalComputerVideo;
  const action = (
    id: string,
    label: string,
    onPress: () => void,
    unavailable = false,
    prominent = false,
  ) => (
    <Button
      testID={id}
      onPress={() => {
        if (!unavailable) {
          haptic('selection');
          onPress();
        }
      }}
      modifiers={[
        buttonStyle(prominent ? 'borderedProminent' : 'bordered'),
        controlSize('large'),
        disabled(unavailable),
        accessibilityLabel(label),
        nativeFrame({ minHeight: theme.touch }),
      ]}
    >
      <NativeText modifiers={[font({ textStyle: 'body' }), nativeFrame({ maxWidth: Infinity })]}>
        {label}
      </NativeText>
    </Button>
  );
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: theme.layer.canvas.fill,
      }}
    >
      <View style={{ paddingHorizontal: space.x3, paddingVertical: space.x2 }}>
        <Text variant="title" accessibilityLiveRegion="polite">
          {t.computerTitle(bot?.displayName ?? slug ?? '')}
        </Text>
        <Text tone="muted" accessibilityLiveRegion="polite">
          {controlling ? t.computerYouDriving : t.computerWatching}
          {host?.paused ? ` · ${t.computerVideoBotsPaused}` : ''}
        </Text>
      </View>
      <View style={{ flex: 1, minHeight: theme.touch }}>
        {mediaMounted && Video !== undefined ? (
          <ComputerVideoStage
            key={binding.attemptId}
            frame={frame}
            driving={driving}
            controlling={controlling}
            revealCursor={false}
            cursor={cursor}
            preview={preview}
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
        style={{ flexShrink: 1, flexGrow: 0 }}
        contentContainerStyle={{ padding: space.x3, gap: space.x2 }}
      >
        {message ? (
          <Text
            testID="computer-video-recovery-message"
            tone="muted"
            accessibilityLiveRegion="polite"
          >
            {message}
          </Text>
        ) : null}
        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
        >
          <VStack spacing={space.x2} modifiers={[nativeFrame({ maxWidth: Infinity })]}>
            {action(
              'computer-video-control',
              actions.handBack ? t.computerVideoHandBack : t.computerVideoTakeover,
              () => void (actions.handBack ? viewer?.resume() : viewer?.takeover()),
              toggleDisabled,
              true,
            )}
            {controlling
              ? action(
                  'computer-video-click',
                  t.computerLeftClick,
                  () => click(cursor.get(), 'left'),
                  !driving,
                )
              : null}
            {mediaMounted
              ? action('computer-video-reset', t.computerVideoReset, () =>
                  preview.set({ scale: 1, x: 0, y: 0 }),
                )
              : null}
            {actions.recovery && (actions.recovery === 'pair' || !nativeMissing)
              ? action(
                  'computer-video-reconnect',
                  actions.recovery === 'pair'
                    ? t.pairAgain
                    : actions.recovery === 'host'
                      ? t.retry
                      : t.computerVideoReconnect,
                  recover,
                  state.busy,
                )
              : null}
            {action('computer-video-close', t.computerVideoExit, close)}
          </VStack>
        </Host>
      </ScrollView>
    </View>
  );
}
