import {
  Button as ComposeButton,
  Host,
  Row,
  Text as ComposeText,
  FilledTonalButton,
  ToggleButton,
} from '@expo/ui/jetpack-compose';
import { defaultMinSize, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { AppState, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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
import { computerCanvas, space } from '../design/tokens';
import { DesignThemeProvider, useDesignTheme, type Appearance } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { NativeLocalComputerVideo } from './local-computer-video.android';
import { ComputerVideoStage } from './computer-video-stage';
import { ComputerVideoHeader } from './computer-video-header.android';
import type { ComputerClickFeedback } from './computer-click-ripple';
import { ComputerWheelButton } from './computer-wheel-button';
import { ComputerScrollPad } from './computer-scroll-pad';
import { ComputerVideoKeyboard, remoteKeyboardAvailable } from './computer-video-keyboard';
import { localVideoNotice } from './local-video-notice';

const idle: LocalVideoClientState = {
  status: 'idle',
  host: undefined,
  presenting: false,
  busy: false,
  code: undefined,
};

export function LocalComputerScreen({ Legacy }: { Legacy: ComponentType }) {
  const theme = useDesignTheme();
  const fallbackAppearance = { scheme: theme.scheme, accent: theme.color.accent };
  return (
    <DesignThemeProvider appearance={{ scheme: 'dark', accent: theme.color.accent }}>
      <ComputerScreen Legacy={Legacy} fallbackAppearance={fallbackAppearance} />
    </DesignThemeProvider>
  );
}

function ComputerScreen({
  Legacy,
  fallbackAppearance,
}: {
  Legacy: ComponentType;
  fallbackAppearance: Appearance;
}) {
  const focused = useIsFocused();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client, saved } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const [keyboardGrant, setKeyboardGrant] = useState<{
    viewerId: string;
    generation: number;
    request: number;
  }>();
  const keyboardRequest = useRef(0);
  const [keyboardIncomplete, setKeyboardIncomplete] = useState(false);
  const [exiting, setExiting] = useState(false);
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

  const keyboardOpen =
    connected &&
    state.status === 'controlling' &&
    keyboardGrant !== undefined &&
    keyboardGrant.viewerId === state.host?.binding?.viewerId &&
    keyboardGrant.generation === state.host?.grant?.generation;
  const setKeyboardOpen = (open: boolean) => {
    if (open) setKeyboardIncomplete(false);
    const host = viewer?.getState().host;
    setKeyboardGrant(
      open && host?.binding && host.grant
        ? {
            viewerId: host.binding.viewerId,
            generation: host.grant.generation,
            request: ++keyboardRequest.current,
          }
        : undefined,
    );
  };
  usePreventRemove(keyboardOpen && !exiting, () => setKeyboardOpen(false));
  useFocusEffect(
    useCallback(() => {
      if (!exiting) return;
      void viewer?.stop();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }, [exiting, router, viewer]),
  );
  if (state.status === 'unsupported')
    return (
      <DesignThemeProvider appearance={fallbackAppearance}>
        <Legacy />
      </DesignThemeProvider>
    );
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
  const send = (input: DesktopInput | undefined): Promise<boolean> => {
    const current = viewer?.getState().host;
    if (
      current?.binding?.runtimeId !== binding?.runtimeId ||
      current?.binding?.viewerId !== binding?.viewerId ||
      current?.binding?.attemptId !== binding?.attemptId ||
      current?.grant?.generation !== host?.grant?.generation
    )
      return Promise.resolve(false);
    return input === undefined
      ? Promise.resolve(false)
      : (viewer?.input(input) ?? Promise.resolve(false));
  };
  const click = async (point: { x: number; y: number }, button: 'left' | 'right') => {
    const input = videoPointerClick({ point, frame, button, driving });
    if (input === undefined) return false;
    const delivered = await send(input);
    const current = viewer?.getState();
    if (
      delivered &&
      binding !== undefined &&
      current?.status === 'controlling' &&
      current.host?.binding?.attemptId === binding.attemptId &&
      current.host?.grant?.generation === host?.grant?.generation
    )
      clickFeedback.set({
        sequence: ++clickSequence.current,
        attemptId: binding.attemptId,
        point: { x: input.x, y: input.y },
        button,
      });
    return delivered;
  };
  const scroll = (axis: 'horizontal' | 'vertical', steps: number) =>
    send(videoPointerScroll({ point: cursor.get(), frame, axis, steps, driving }));
  const close = () => setExiting(true);
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
    <KeyboardAvoidingView
      behavior="padding"
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: computerCanvas.background,
      }}
    >
      {focused ? <StatusBar style="light" /> : null}
      <ComputerVideoHeader
        hostId={saved?.hostId}
        hostName={saved?.hostName}
        connected={connected}
        state={state}
        onExit={close}
      />
      <View style={{ flex: 1, minHeight: theme.touch }}>
        {mediaMounted && Video !== undefined ? (
          <ComputerVideoStage
            key={binding.attemptId}
            clickFeedback={{ attemptId: binding.attemptId, events: clickFeedback }}
            frame={frame}
            driving={driving}
            controlling={controlling}
            revealCursor={keyboardOpen}
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
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{
          paddingHorizontal: space.x4,
          paddingBottom: space.x3,
          gap: space.x3,
        }}
      >
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
        {keyboardIncomplete ? (
          <Text
            accessibilityLiveRegion="polite"
            tone="muted"
            testID="computer-video-keyboard-error"
          >
            {t.computerKeyboardIncomplete}
          </Text>
        ) : null}
        {controlling && !keyboardOpen ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x3,
              paddingVertical: space.x2,
            }}
          >
            <ComputerWheelButton
              key={'left-' + host?.grant?.generation}
              side="left"
              enabled={driving}
              compact={landscape}
              onClick={() => void click(cursor.get(), 'left')}
              onScroll={scroll}
            />
            <ComputerScrollPad
              key={host?.grant?.generation}
              enabled={driving}
              compact={landscape}
              onScroll={scroll}
            />
            <ComputerWheelButton
              key={'right-' + host?.grant?.generation}
              side="right"
              enabled={driving}
              compact={landscape}
              onClick={() => void click(cursor.get(), 'right')}
              onScroll={scroll}
            />
          </View>
        ) : null}
        {controlling ? (
          <ComputerVideoKeyboard
            key={host?.grant?.generation}
            open={keyboardOpen}
            enabled={driving}
            session={keyboardGrant ? String(keyboardGrant.request) : ''}
            onInput={send}
            onFailure={() => setKeyboardIncomplete(true)}
            onClose={() =>
              setKeyboardGrant((current) => (current === keyboardGrant ? undefined : current))
            }
          />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <Host
              matchContents
              colorScheme={theme.scheme}
              seedColor={theme.color.accent}
              ignoreSafeAreaKeyboardInsets
            >
              <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: space.x3 }}>
                <ComposeButton
                  enabled={!toggleDisabled}
                  onClick={() => void (actions.handBack ? viewer?.resume() : viewer?.takeover())}
                  modifiers={[
                    defaultMinSize({ minHeight: theme.touch }),
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
                {controlling ? (
                  <ToggleButton
                    enabled={remoteKeyboardAvailable && (keyboardOpen || driving)}
                    checked={keyboardOpen}
                    onCheckedChange={setKeyboardOpen}
                    modifiers={[
                      testID('computer-video-keyboard'),
                      defaultMinSize({ minHeight: theme.touch }),
                    ]}
                  >
                    <ComposeText>
                      {!remoteKeyboardAvailable
                        ? t.computerKeyboardUpdate
                        : keyboardOpen
                          ? t.computerHideKeyboard
                          : t.computerVideoKeyboard}
                    </ComposeText>
                  </ToggleButton>
                ) : null}
                {mediaMounted ? (
                  <FilledTonalButton
                    onClick={() => preview.set({ scale: 1, x: 0, y: 0 })}
                    modifiers={[
                      testID('computer-video-reset'),
                      defaultMinSize({ minHeight: theme.touch }),
                    ]}
                  >
                    <ComposeText>{t.computerVideoReset}</ComposeText>
                  </FilledTonalButton>
                ) : null}
                {actions.recovery === 'pair' ||
                (!nativeMissing && actions.recovery !== undefined) ? (
                  <FilledTonalButton
                    enabled={actions.recovery !== 'video' || !state.busy}
                    onClick={recover}
                    modifiers={[
                      defaultMinSize({ minHeight: theme.touch }),
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
                  </FilledTonalButton>
                ) : null}
              </Row>
            </Host>
          </ScrollView>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
