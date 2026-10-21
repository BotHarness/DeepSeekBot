import { Text } from '../src/ui/primitives/system-text';
import { useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { fullClientSource, fullClientTarget, type FullClientParams } from '../src/host/full-client';
import { useHostSession, useHostSnapshot } from '../src/host/host-session';
import { FloatingExit } from '../src/ui/floating-exit';
import { FullClientView, type FullClientWeb } from '../src/ui/full-client-view';
import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';
import { LoadingIndicator } from '../src/ui/primitives/loading-indicator';

export default function FullClientScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<FullClientParams>();
  const { saved, client } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'loaded' | 'refused' | 'unreachable'>('loading');

  const sourceChanged = !!params.hostId && saved?.hostId !== params.hostId;
  const route =
    snapshot.connection.route !== '' ? snapshot.connection.route : (saved?.routes[0] ?? '');
  const revoked = saved === null || state === 'refused' || snapshot.connection.status === 'refused';

  const navigation = useNavigation();
  const web = useRef<FullClientWeb>(null);
  const exiting = useRef(false);
  const [webBack, setWebBack] = useState(false);
  usePreventRemove(Platform.OS === 'android' && webBack, ({ data }) => {
    if (exiting.current) navigation.dispatch(data.action);
    else web.current?.goBack();
  });

  const close = () => {
    exiting.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const retry = () => {
    setState('loading');
    setAttempt((value) => value + 1);
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.background }}>
      {sourceChanged ? (
        <View style={{ flex: 1, padding: 24 }}>
          <Text accessibilityRole="alert">{t.creationSourceChanged}</Text>
        </View>
      ) : revoked || state === 'unreachable' ? (
        <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
          <Text
            accessibilityRole="alert"
            style={{ color: theme.ink, fontSize: 17, fontWeight: '600', textAlign: 'center' }}
          >
            {revoked ? t.fullClientRevoked : t.fullClientUnreachable}
          </Text>
          {state === 'unreachable' && !revoked ? (
            <Text selectable style={{ color: theme.inkSoft, fontSize: 13, textAlign: 'center' }}>
              {t.tried}: {route}
            </Text>
          ) : null}
          <Pressable
            onPress={revoked ? () => router.replace('/pair') : retry}
            accessibilityRole="button"
            style={{
              alignSelf: 'center',
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: theme.accent,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>
              {revoked ? t.pairAgain : t.retry}
            </Text>
          </Pressable>
        </View>
      ) : saved === undefined || route === '' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingIndicator />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FullClientView
            key={attempt}
            ref={web}
            route={route}
            source={fullClientSource(route, saved.credential, fullClientTarget(params))}
            onLoaded={() => setState((current) => (current === 'loading' ? 'loaded' : current))}
            onFailed={setState}
            onCanGoBack={setWebBack}
          />
          {state === 'loading' ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.background,
              }}
            >
              <LoadingIndicator />
            </View>
          ) : null}
        </View>
      )}
      <FloatingExit onExit={close} />
    </View>
  );
}
