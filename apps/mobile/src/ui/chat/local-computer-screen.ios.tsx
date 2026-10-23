import { Host } from '@expo/ui';
import { Button, HStack, Image, Text as NativeText, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  buttonBorderShape,
  disabled,
  font,
  frame as nativeFrame,
} from '@expo/ui/swift-ui/modifiers';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ComponentProps,
  type ComponentType,
} from 'react';
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
import { computerVideo, space } from '../design/tokens';
import { DesignThemeProvider, resolveTheme, useDesignTheme } from '../design/theme';
import { useHostLook } from '../../host/native-host-look';
import { shownHostName } from '../design/host-look';
import { useLiquidGlass } from '../primitives/drawer-material';
import { ComputerVideoHeader } from './computer-video-header.ios';
import { computerVideoStatus } from './computer-video-status';
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
  const { client, saved } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const snapshot = useHostSnapshot(client);
  const router = useRouter();
  const outerTheme = useDesignTheme();
  const theme = { ...outerTheme, ...resolveTheme('dark', {}, 'ios') };
  const glass = useLiquidGlass();
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
    if (router.canGoBack()) router.back();
    else router.replace('/');
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
  const name = saved ? shownHostName(look, saved.hostName) : t.profileComputer;
  const status = computerVideoStatus(state, snapshot.connection);
  const Video = NativeLocalComputerVideo;
  const action = (
    id: string,
    label: string,
    onPress: () => void,
    unavailable = false,
    prominent = false,
    symbol?: ComponentProps<typeof Image>['systemName'],
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
        buttonStyle(
          glass
            ? prominent
              ? 'glassProminent'
              : 'glass'
            : prominent
              ? 'borderedProminent'
              : 'bordered',
        ),
        buttonBorderShape(symbol ? 'circle' : 'capsule'),
        controlSize('large'),
        disabled(unavailable),
        accessibilityLabel(label),
        nativeFrame({ minHeight: theme.touch }),
      ]}
    >
      {symbol ? (
        <Image
          systemName={symbol}
          size={theme.type.title.line}
          modifiers={[
            nativeFrame({ minWidth: theme.touch - space.x5, minHeight: theme.touch - space.x5 }),
          ]}
        />
      ) : (
        <NativeText modifiers={[font({ textStyle: 'body' })]}>{label}</NativeText>
      )}
    </Button>
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
          backgroundColor: computerVideo.canvas,
        }}
      >
        <Stack.Screen
          options={{
            headerShown: true,
            headerTransparent: true,
            headerStyle: {},
            headerShadowVisible: false,
            headerBackVisible: false,
            headerTintColor: theme.color.fg,
            statusBarStyle: 'light',
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
          }}
        />
        <View style={{ flex: 1, minHeight: theme.touch }}>
          {mediaMounted && Video !== undefined ? (
            <ComputerVideoStage
              key={binding.attemptId}
              frame={frame}
              driving={driving}
              controlling={controlling}
              revealCursor={false}
              backgroundColor={computerVideo.canvas}
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
            <VStack spacing={space.x3} modifiers={[nativeFrame({ maxWidth: Infinity })]}>
              <HStack spacing={space.x3}>
                {action(
                  'computer-video-control',
                  actions.handBack ? t.computerVideoHandBack : t.computerVideoTakeover,
                  () => void (actions.handBack ? viewer?.resume() : viewer?.takeover()),
                  toggleDisabled,
                  true,
                )}
                {mediaMounted
                  ? action(
                      'computer-video-reset',
                      t.computerVideoReset,
                      () => preview.set({ scale: 1, x: 0, y: 0 }),
                      false,
                      false,
                      'arrow.up.left.and.arrow.down.right',
                    )
                  : null}
              </HStack>
              {controlling ? (
                <HStack spacing={space.x4}>
                  {action(
                    'computer-video-click',
                    t.computerLeftClick,
                    () => click(cursor.get(), 'left'),
                    !driving,
                  )}
                  {action(
                    'computer-video-right-click',
                    t.computerRightClick,
                    () => click(cursor.get(), 'right'),
                    !driving,
                  )}
                </HStack>
              ) : null}
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
            </VStack>
          </Host>
        </ScrollView>
      </View>
    </DesignThemeProvider>
  );
}
