import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { TextInput } from '../../src/ui/primitives/system-text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Keyboard, Pressable, View, type ViewInstance, type TextInputInstance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createBrowserViewer, type BrowserViewerState } from '../../src/host/browser-viewer';
import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { BrowserStage, type BrowserTouchMode } from '../../src/ui/chat/browser-stage';
import { edge, radius, space } from '../../src/ui/design/tokens';
import { useDesignTheme } from '../../src/ui/design/theme';
import { Button } from '../../src/ui/primitives/button';
import { Text } from '../../src/ui/primitives/text';
import { CloseIcon, KeyboardIcon } from '../../src/ui/shell/icons';
import { useMounted } from '../../src/ui/mounted';
import { t } from '../../src/ui/strings';
import { LoadingIndicator } from '../../src/ui/primitives/loading-indicator';

const idle: BrowserViewerState = { status: 'loading', takeover: false, switching: false };

export default function BrowserScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { client } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const bot = snapshot.roster?.bots.find((entry) => entry.slug === slug);
  const viewer = useMemo(
    () =>
      client === undefined || slug === undefined
        ? undefined
        : createBrowserViewer({ client, slug }),
    [client, slug],
  );
  const state = useSyncExternalStore(
    (listener) => viewer?.subscribe(listener) ?? (() => {}),
    () => viewer?.getState() ?? idle,
  );
  const [mode, setMode] = useState<BrowserTouchMode>('direct');
  const keyboard = useRef<TextInputInstance>(null);
  const [typing, setTyping] = useState(false);

  const mount = useMounted<ViewInstance>(() => {
    viewer?.start();
    const shown = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => {
      shown.remove();
      hidden.remove();
      if (viewer?.getState().takeover === true) void viewer.setTakeover(false);
      viewer?.stop();
    };
  }, [viewer]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const revoked = state.status === 'refused' || snapshot.connection.status === 'refused';
  const message = revoked
    ? t.browserRevoked
    : state.status === 'no-access'
      ? t.browserNoAccess
      : state.status === 'not-running'
        ? t.browserNotRunning
        : state.status === 'unreachable' && state.frame === undefined
          ? t.browserUnreachable
          : undefined;
  const live = !revoked && state.frame !== undefined && message === undefined;
  const driving = live && state.takeover;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.color.base }}>
      <View
        style={{
          paddingTop: insets.top + space.x3,
          paddingHorizontal: space.x5,
          paddingBottom: space.x3,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x4,
          borderBottomWidth: edge.hairline,
          borderBottomColor: theme.color.divider,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.browserClose}
          onPress={close}
          hitSlop={space.x3}
          style={{
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.surface,
          }}
        >
          <CloseIcon color={theme.color.fg} size={theme.touch / 2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {t.browserTitle(bot?.displayName ?? slug ?? '')}
          </Text>
          <Text variant="meta" tone={driving ? 'accent' : 'muted'} numberOfLines={2}>
            {live ? (driving ? t.browserYouDriving : t.browserBotDriving) : ' '}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View ref={mount} style={{ flex: 1 }}>
          {live ? (
            <BrowserStage
              frame={state.frame!}
              interactive={driving}
              mode={mode}
              onInput={(input) => void viewer?.send(input)}
            />
          ) : (
            <View
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.x6 }}
            >
              {message === undefined ? (
                <>
                  <LoadingIndicator color={theme.color.muted} />
                  <Text tone="muted" style={{ marginTop: space.x4 }}>
                    {t.browserLoading}
                  </Text>
                </>
              ) : (
                <>
                  <Text accessibilityRole="alert" tone="muted" style={{ textAlign: 'center' }}>
                    {message}
                  </Text>
                  {!revoked ? null : (
                    <View style={{ alignSelf: 'stretch', marginTop: space.x5 }}>
                      <Button
                        label={t.pairAgain}
                        tone="primary"
                        onPress={() => router.replace('/pair')}
                      />
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </View>

        {state.notice === undefined || !live ? null : (
          <Text
            accessibilityLiveRegion="polite"
            variant="meta"
            tone="warning"
            numberOfLines={2}
            style={{
              backgroundColor: theme.color.warningSoft,
              paddingHorizontal: space.x5,
              paddingVertical: space.x3,
            }}
          >
            {state.notice}
          </Text>
        )}

        {!live ? null : (
          <View
            style={{
              paddingHorizontal: space.x5,
              paddingTop: space.x4,
              paddingBottom: insets.bottom + space.x4,
              gap: space.x4,
              borderTopWidth: edge.hairline,
              borderTopColor: theme.color.divider,
            }}
          >
            {!driving ? null : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
                <View
                  accessibilityRole="radiogroup"
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    padding: space.x2,
                    borderRadius: radius.md,
                    backgroundColor: theme.color.surface,
                  }}
                >
                  {(['direct', 'trackpad'] as const).map((option) => (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: mode === option }}
                      accessibilityLabel={option === 'direct' ? t.browserDirect : t.browserTrackpad}
                      onPress={() => setMode(option)}
                      style={{
                        flex: 1,
                        minHeight: theme.touch - space.x3,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.sm,
                        backgroundColor: mode === option ? theme.color.elevated : undefined,
                      }}
                    >
                      <Text variant="meta" strong={mode === option}>
                        {option === 'direct' ? t.browserDirect : t.browserTrackpad}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.browserKeyboard}
                  accessibilityState={{ selected: typing }}
                  onPress={() => (typing ? Keyboard.dismiss() : keyboard.current?.focus())}
                  style={{
                    width: theme.touch,
                    height: theme.touch,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: typing ? theme.color.elevated : theme.color.surface,
                  }}
                >
                  <KeyboardIcon color={theme.color.fg} size={theme.touch / 2} />
                </Pressable>
              </View>
            )}
            <Button
              label={driving ? t.browserResume : t.browserPause}
              tone={driving ? 'secondary' : 'primary'}
              busy={state.switching}
              onPress={() => {
                Keyboard.dismiss();
                void viewer?.setTakeover(!driving);
              }}
            />
            {!driving ? null : (
              <TextInput
                ref={keyboard}
                accessibilityLabel={t.browserTypeHere}
                value=""
                autoCapitalize="none"
                autoCorrect={false}
                submitBehavior="submit"
                onChangeText={(text) => {
                  if (text !== '') void viewer?.send({ kind: 'type', text });
                }}
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === 'Backspace')
                    void viewer?.send({ kind: 'key', key: 'Backspace' });
                }}
                onSubmitEditing={() => void viewer?.send({ kind: 'key', key: 'Enter' })}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}
