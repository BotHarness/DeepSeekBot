import {
  Button as ComposeButton,
  Host,
  Icon,
  IconButton,
  Row,
  Text as ComposeText,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, testID, weight } from '@expo/ui/jetpack-compose/modifiers';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useSyncExternalStore, type ComponentType } from 'react';
import { AppState, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createLocalVideoClient,
  type LocalVideoClientState,
} from '../../../../../packages/computer/src/local-video-client';
import { videoPointerClick, videoPointerScroll } from '../../host/local-video-pointer';
import type { DesktopInput } from '../../../../../packages/computer/src/desktop-view';
import type { StageZoom } from '../../host/browser-viewer';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { localVideoActions, watchLocalVideoForeground } from '../../host/local-video-actions';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { NativeLocalComputerVideo } from './local-computer-video.android';
import { ComputerVideoStage } from './computer-video-stage';
import { ComputerWheelButton } from './computer-wheel-button';
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
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
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
  const actions = localVideoActions({ state, connection: snapshot.connection });
  const binding = host?.binding;
  const mediaMounted =
    !revoked &&
    !nativeMissing &&
    binding !== undefined &&
    host?.offer !== undefined &&
    connected &&
    (state.status === 'observing' || state.status === 'controlling');
  const controlling = mediaMounted && state.status === 'controlling';
  const driving = controlling && state.presenting && host?.media.status === 'live' && !state.busy;
  const frame = { width: host?.media.width ?? 0, height: host?.media.height ?? 0 };
  const Video = NativeLocalComputerVideo;
  const send = (input: DesktopInput | undefined) => {
    const current = viewer?.getState().host;
    if (
      current?.binding?.runtimeId !== binding?.runtimeId ||
      current?.binding?.viewerId !== binding?.viewerId ||
      current?.binding?.attemptId !== binding?.attemptId ||
      current?.grant?.generation !== host?.grant?.generation
    )
      return;
    if (input !== undefined) void viewer?.input(input);
  };
  const click = (point: { x: number; y: number }, button: 'left' | 'right') =>
    send(videoPointerClick({ point, frame, button, driving }));
  const scroll = (axis: 'horizontal' | 'vertical', steps: number) =>
    send(videoPointerScroll({ point: cursor.get(), frame, axis, steps, driving }));
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const close = () => {
    void viewer?.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const message = localVideoNotice({
    connection: snapshot.connection,
    state,
    nativeMissing,
    mediaMounted,
  });
  const recover = () => {
    switch (actions.recovery) {
      case 'pair':
        router.push('/pair');
        break;
      case 'host':
        client?.retryNow();
        break;
      case 'video':
        void viewer?.reconnect();
        break;
    }
  };
  const toggleDisabled =
    state.busy ||
    revoked ||
    !connected ||
    (!actions.handBack &&
      (!mediaMounted ||
        !state.presenting ||
        host?.media.status !== 'live' ||
        !host.media.captureAlive));

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
      <View
        style={{
          paddingHorizontal: space.x3,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
        }}
      >
        <Text
          variant="title"
          numberOfLines={1}
          style={{ flex: 1 }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${t.computerTitle(bot?.displayName ?? slug ?? '')}, ${controlling ? t.computerYouDriving : t.computerWatching}${host?.paused ? `, ${t.computerVideoBotsPaused}` : ''}`}
        >
          {t.computerTitle(bot?.displayName ?? slug ?? '')}
        </Text>
        <View testID="computer-video-close">
          <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
            <IconButton
              onClick={close}
              modifiers={[semantics({ contentDescription: t.computerVideoExit })]}
            >
              <Icon
                source={require('../../../assets/toolbar/close.png')}
                size={theme.type.title.line}
              />
            </IconButton>
          </Host>
        </View>
      </View>
      <View style={{ flex: 1, minHeight: theme.touch }}>
        {mediaMounted && Video !== undefined ? (
          <ComputerVideoStage
            key={binding.attemptId}
            frame={frame}
            driving={driving}
            controlling={controlling}
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
      <View style={{ paddingHorizontal: space.x3, paddingBottom: space.x2, flexShrink: 1 }}>
        {message === undefined ? null : (
          <ScrollView
            testID="computer-video-recovery-message"
            style={{ flexShrink: 1 }}
            contentInsetAdjustmentBehavior="never"
          >
            <Text accessibilityLiveRegion="polite" tone="muted">
              {message}
            </Text>
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          {controlling ? (
            <ComputerWheelButton
              key={`left-${host?.grant?.generation}`}
              side="left"
              enabled={driving}
              compact={landscape}
              onClick={() => click(cursor.get(), 'left')}
              onScroll={scroll}
            />
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Host
              matchContents={{ vertical: true }}
              style={{ width: '100%' }}
              colorScheme={theme.scheme}
              seedColor={theme.color.accent}
            >
              <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                <ComposeButton
                  enabled={!toggleDisabled}
                  onClick={() => void (actions.handBack ? viewer?.resume() : viewer?.takeover())}
                  modifiers={[
                    weight(1),
                    testID('computer-video-control'),
                    semantics({
                      contentDescription: actions.handBack
                        ? t.computerVideoHandBack
                        : t.computerVideoTakeover,
                    }),
                  ]}
                >
                  <ComposeText>
                    {actions.handBack ? t.computerVideoHandBack : t.computerVideoTakeover}
                  </ComposeText>
                </ComposeButton>
                {mediaMounted ? (
                  <TextButton
                    onClick={() => preview.set({ scale: 1, x: 0, y: 0 })}
                    modifiers={[testID('computer-video-reset')]}
                  >
                    <ComposeText>{t.computerVideoReset}</ComposeText>
                  </TextButton>
                ) : null}
                {actions.recovery === 'pair' ||
                (!nativeMissing && actions.recovery !== undefined) ? (
                  <TextButton
                    enabled={actions.recovery !== 'video' || !state.busy}
                    onClick={recover}
                    modifiers={[
                      testID(
                        actions.recovery === 'pair'
                          ? 'computer-video-pair-again'
                          : actions.recovery === 'host'
                            ? 'computer-video-retry-connection'
                            : 'computer-video-reconnect',
                      ),
                    ]}
                  >
                    <ComposeText>
                      {actions.recovery === 'pair'
                        ? t.pairAgain
                        : actions.recovery === 'host'
                          ? t.retry
                          : t.computerVideoReconnect}
                    </ComposeText>
                  </TextButton>
                ) : null}
              </Row>
            </Host>
          </View>
          {controlling ? (
            <ComputerWheelButton
              key={`right-${host?.grant?.generation}`}
              side="right"
              enabled={driving}
              compact={landscape}
              onClick={() => click(cursor.get(), 'right')}
              onScroll={scroll}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
