import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createCallClient,
  type CallClient,
  type CallClientState,
  type CallPost,
} from '../../../../../packages/core/src/voice/call-client';
import { VOICE_CALL_PATH } from '../../../../../packages/core/src/voice/call-contract';
import { createCallMedia, microphoneAccess } from '../../host/call-media';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { BotAvatar } from '../bot-avatar';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { SystemSymbol } from '../primitives/system-symbol';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { callScreenModel, formatCallDuration } from './call-model';

const testBuild = () =>
  typeof __DEV__ !== 'undefined' && __DEV__ && Application.applicationId?.endsWith('.dev') === true;

type ScriptStep = { at: number; url: string };

function hostPost(api: ReturnType<typeof useHostSession>['client']): CallPost {
  return async (body) => {
    if (api === undefined) throw new Error('No Host connection.');
    const answer = await api.api(VOICE_CALL_PATH, { body });
    const result = answer.body as { ok?: unknown } | null;
    if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean')
      throw new Error(`The Host answered ${answer.status}.`);
    return result as Awaited<ReturnType<CallPost>>;
  };
}

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
  const [state, setState] = useState<CallClientState>({ status: 'idle' });
  const [startedAt, setStartedAt] = useState<number>();
  const [now, setNow] = useState(Date.now());
  const [attempt, setAttempt] = useState(0);
  const [microphone, setMicrophone] = useState<'granted' | 'denied' | 'blocked'>();
  const [report, setReport] = useState<string>();
  const callRef = useRef<CallClient | undefined>(undefined);
  const dialed = useRef<number | undefined>(undefined);
  const testAudio = testBuild() && script !== undefined;
  const media = useMemo(() => createCallMedia({ testAudio }), [testAudio, attempt]);

  useFocusEffect(
    useCallback(() => {
      if (client === undefined || media === undefined || dialed.current === attempt) return;
      dialed.current = attempt;
      let cancelled = false;
      const timeline: Record<string, unknown>[] = [];
      const mark = (kind: string, detail: Record<string, unknown> = {}) =>
        timeline.push({ kind, at: Date.now(), ...detail });
      const call = createCallClient({
        post: hostPost(client),
        media,
        onChange: (next) => {
          if (cancelled) return;
          setState(next);
          if (next.status === 'live') setStartedAt((previous) => previous ?? Date.now());
          if (testAudio)
            mark('state', {
              status: next.status,
              phase: next.status === 'live' ? next.call.phase : undefined,
            });
        },
      });
      callRef.current = call;
      const removeTap = media.test?.onTap((event) => mark('native', event));
      void (async () => {
        const access = await microphoneAccess();
        if (cancelled) return;
        setMicrophone(access);
        if (access !== 'granted') return;
        await call.open(slug);
        if (cancelled || !testAudio || media.test === undefined || script === undefined) return;
        try {
          const steps = (await (await fetch(script)).json()) as ScriptStep[];
          const started = Date.now();
          for (const step of steps.slice(0, 20)) {
            const local = await File.downloadFileAsync(step.url, Paths.cache, { idempotent: true });
            const wait = started + step.at - Date.now();
            if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
            if (cancelled) return;
            mark('inject', { url: step.url, ok: await media.test.inject(local.uri) });
          }
        } catch (error) {
          mark('script-failed', { error: String(error) });
        }
      })();
      return () => {
        removeTap?.();
        call.dispose();
        cancelled = true;
        callRef.current = undefined;
        if (testAudio) {
          const file = new File(Paths.cache, `call-report-${Date.now()}.json`);
          setTimeout(() => {
            file.write(JSON.stringify({ timeline, recording: media.test?.recording() ?? null }));
            setReport(file.uri);
          }, 500);
        }
      };
    }, [client, media, slug, script, testAudio, attempt]),
  );

  const ticking = state.status === 'live';
  useFocusEffect(
    useCallback(() => {
      if (!ticking) return;
      const timer = setInterval(() => setNow(Date.now()), 1_000);
      return () => clearInterval(timer);
    }, [ticking]),
  );

  const model = callScreenModel(t, state);
  const leave = () => {
    if (router.canGoBack()) router.back();
    else
      router.replace({
        pathname: '/dm/[slug]',
        params: { slug, ...(hostId === undefined ? {} : { hostId }) },
      });
  };
  const close = () => {
    void callRef.current?.hangup();
    leave();
  };
  const duration = startedAt === undefined ? undefined : formatCallDuration(now - startedAt);
  const unsupported = media === undefined;
  const ended = unsupported
    ? t.call.phoneUnsupported
    : microphone === 'denied' || microphone === 'blocked'
      ? t.call.noMicrophone
      : model.ended;

  const round = theme.touch * 1.5;
  const roundButton = (input: {
    label: string;
    testID: string;
    symbol: Parameters<typeof SystemSymbol>[0]['name'];
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
        <View style={{ alignItems: 'center', gap: space.x4 }}>
          {bot === undefined ? null : <BotAvatar bot={bot} size={theme.touch * 2.5} />}
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
          {model.hint === undefined ? null : (
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
                {model.hint}
              </Text>
            </View>
          )}
          {report === undefined ? null : (
            <Text testID="call-test-report" variant="meta" tone="subtle" selectable>
              {report}
            </Text>
          )}
        </View>
        {ended !== undefined ? (
          <View style={{ gap: space.x4 }}>
            {microphone === 'blocked' ? (
              <Button
                testID="call-open-settings"
                label={t.call.openSettings}
                tone="primary"
                onPress={() => void Linking.openSettings()}
              />
            ) : model.retry && !unsupported && microphone === 'granted' ? (
              <Button
                testID="call-again"
                label={t.call.callAgain}
                tone="primary"
                onPress={() => {
                  setStartedAt(undefined);
                  setState({ status: 'idle' });
                  setAttempt((value) => value + 1);
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
              symbol: model.muted ? 'mic.slash.fill' : 'mic.fill',
              fill: model.muted ? theme.color.fg : theme.color.surface,
              ink: model.muted ? theme.color.base : theme.color.fg,
              selected: model.muted,
              disabled: !model.live,
              onPress: () => void callRef.current?.mute(!model.muted),
            })}
            {roundButton({
              label: t.call.hangUp,
              testID: 'call-hang-up',
              symbol: 'phone.down.fill',
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
