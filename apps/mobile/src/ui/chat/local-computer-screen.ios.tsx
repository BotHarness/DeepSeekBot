import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type ComponentType,
} from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
import { computerCanvas, space } from '../design/tokens';
import { DesignThemeProvider, resolveTheme, useDesignTheme } from '../design/theme';
import { useHostLook } from '../../host/native-host-look';
import { shownHostName } from '../design/host-look';
import type { ComputerClickFeedback } from './computer-click-ripple';
import { ComputerVideoControls } from './computer-video-controls.ios';
import { ComputerVideoHeader } from './computer-video-header.ios';
import { computerVideoStatus } from './computer-video-status';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { haptic } from '../haptics';
import { t } from '../strings';
import { NativeLocalComputerVideo } from './local-computer-video.ios';
import { ComputerVideoStage } from './computer-video-stage';
import { localVideoNotice } from './local-video-notice';

const legacyNavigation = { headerShown: false };

const idle: LocalVideoClientState = {
  status: 'idle',
  host: undefined,
  presenting: false,
  busy: false,
  code: undefined,
};

export function LocalComputerScreen({ Legacy }: { Legacy: ComponentType }) {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client, saved } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const snapshot = useHostSnapshot(client);
  const outerTheme = useDesignTheme();
  const theme = useMemo(
    () => ({
      ...resolveTheme('dark', {}, 'ios'),
      fontScale: outerTheme.fontScale,
      largeText: outerTheme.largeText,
    }),
    [outerTheme.fontScale, outerTheme.largeText],
  );
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
  const clickFeedback = useSharedValue<ComputerClickFeedback | undefined>(undefined);
  const clickSequence = useRef(0);
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
  const click = async (point: { x: number; y: number }, button: 'left' | 'right') => {
    const current = viewer?.getState().host;
    if (
      current?.binding?.runtimeId !== binding?.runtimeId ||
      current?.binding?.viewerId !== binding?.viewerId ||
      current?.binding?.attemptId !== binding?.attemptId ||
      current?.grant?.generation !== host?.grant?.generation
    )
      return;
    const input = videoPointerClick({ point, frame, button, driving });
    if (input === undefined) return;
    const delivered = await viewer?.input(input);
    const accepted = viewer?.getState();
    if (
      delivered &&
      binding !== undefined &&
      accepted?.status === 'controlling' &&
      accepted.host?.binding?.runtimeId === binding.runtimeId &&
      accepted.host.binding.viewerId === binding.viewerId &&
      accepted.host.binding.attemptId === binding.attemptId &&
      accepted.host.grant?.generation === host?.grant?.generation
    )
      clickFeedback.set({
        sequence: ++clickSequence.current,
        attemptId: binding.attemptId,
        point: { x: input.x, y: input.y },
        button,
      });
  };
  const close = useCallback(() => {
    void viewer?.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [viewer]);
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
  const name = saved ? shownHostName(look, saved.hostName) : t.profileComputer;
  const facts = computerVideoStatus(state, snapshot.connection);
  const status = useMemo(
    () => ({ connection: facts.connection, control: facts.control }),
    [facts.connection, facts.control],
  );
  const Video = NativeLocalComputerVideo;
  const screenOptions = useMemo<NonNullable<ComponentProps<typeof Stack.Screen>['options']>>(
    () => ({
      headerShown: true,
      headerTransparent: true,
      headerStyle: {},
      headerShadowVisible: false,
      headerBackVisible: false,
      headerTintColor: theme.color.fg,
      title: '',
      headerTitle: () => <ComputerVideoHeader name={name} status={status} theme={theme} />,
      unstable_headerLeftItems: () => [
        {
          type: 'button',
          label: t.computerVideoExit,
          identifier: 'computer-video-close',
          icon: { type: 'sfSymbol', name: 'chevron.left' },
          onPress: () => {
            haptic('selection');
            close();
          },
        },
      ],
    }),
    [name, status, theme, close],
  );
  if (state.status === 'unsupported')
    return (
      <>
        <Stack.Screen options={legacyNavigation} />
        <Legacy />
      </>
    );
  return (
    <DesignThemeProvider appearance={{ scheme: 'dark' }}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + theme.touch + space.x3,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          backgroundColor: computerCanvas.background,
        }}
      >
        <StatusBar style="light" />
        <Stack.Screen options={screenOptions} />
        <View style={{ flex: 1, minHeight: theme.touch }}>
          {mediaMounted && Video !== undefined ? (
            <ComputerVideoStage
              key={binding.attemptId}
              clickFeedback={{ attemptId: binding.attemptId, events: clickFeedback }}
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
          <ComputerVideoControls
            control={{
              label: actions.handBack ? t.computerVideoHandBack : t.computerVideoTakeover,
              disabled: toggleDisabled,
              onPress: () => void (actions.handBack ? viewer?.resume() : viewer?.takeover()),
            }}
            {...(controlling
              ? {
                  pointer: {
                    disabled: !driving,
                    left: () => click(cursor.get(), 'left'),
                    right: () => click(cursor.get(), 'right'),
                  },
                }
              : {})}
            {...(mediaMounted ? { reset: () => preview.set({ scale: 1, x: 0, y: 0 }) } : {})}
            {...(actions.recovery && (actions.recovery === 'pair' || !nativeMissing)
              ? {
                  recovery: {
                    label:
                      actions.recovery === 'pair'
                        ? t.pairAgain
                        : actions.recovery === 'host'
                          ? t.retry
                          : t.computerVideoReconnect,
                    disabled: state.busy,
                    onPress: recover,
                  },
                }
              : {})}
          />
        </ScrollView>
      </View>
    </DesignThemeProvider>
  );
}
