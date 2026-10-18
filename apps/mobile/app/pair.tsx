import { Text, TextInput } from '../src/ui/primitives/system-text';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { hostSession } from '../src/host/host-session';
import { hostLooks } from '../src/host/native-host-look';
import { HOST_NAME_MAX, hostLookName, withHostName } from '../src/ui/design/host-look';
import { ConnectionNameField } from '../src/ui/primitives/connection-name-field';
import { nativeCarrier } from '../src/host/native-carrier';
import { pairHost, type PairingFailure } from '../src/host/pairing';
import { mobileTelemetry } from '../src/telemetry/native';
import type { PairingMethod } from '../src/telemetry/schema';
import { Button } from '../src/ui/primitives/button';
import { KeyboardFormScroll } from '../src/ui/primitives/keyboard-form';
import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';

function deviceName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

export default function PairScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ p?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<PairingFailure | undefined>();
  const lastMethod = useRef<PairingMethod>('paste');
  const pending = useRef<AbortController | undefined>(undefined);
  const handled = useRef<string | undefined>(undefined);

  const pair = async (text: string, method: PairingMethod, retry = false): Promise<void> => {
    if (pending.current !== undefined || (!retry && method === 'qr' && handled.current === text))
      return;
    handled.current = text;
    lastMethod.current = method;
    const operation = new AbortController();
    pending.current = operation;
    setBusy(true);
    setError(undefined);
    const result = await pairHost({
      text,
      method,
      deviceName: deviceName(),
      carrier: nativeCarrier(),
      save: async (host) => {
        await hostSession.pair(host);
        const name = hostLookName(connectionName);
        if (name) hostLooks.set(host.hostId, withHostName(hostLooks.look(host.hostId), name));
      },
      telemetry: mobileTelemetry,
      signal: operation.signal,
    });
    pending.current = undefined;
    setBusy(false);
    if (operation.signal.aborted) return;
    if (!result.ok) return setError(result.code);
    router.replace('/');
  };

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (typeof params.p === 'string' && handled.current === undefined)
        void pair(`deepseekbot://pair?p=${params.p}`, 'deep_link');
      return () => {
        setFocused(false);
        pending.current?.abort();
      };
    }, [params.p]),
  );

  const button = {
    backgroundColor: theme.brand,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  } as const;

  return (
    <KeyboardFormScroll
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Button label={t.cloud.title} onPress={() => router.push('/cloud-services')} />
      <Text style={{ color: theme.inkSoft, fontSize: 14 }}>{t.pairHint}</Text>
      <ConnectionNameField
        value={connectionName}
        onChange={setConnectionName}
        maxLength={HOST_NAME_MAX}
        disabled={busy}
      />
      <View
        style={{
          aspectRatio: 1,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: theme.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {permission?.granted ? (
          focused && (
            <CameraView
              style={{ width: '100%', height: '100%' }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => void pair(data, 'qr')}
            />
          )
        ) : (
          <Pressable
            onPress={() => void requestPermission()}
            accessibilityRole="button"
            style={{ padding: 16 }}
          >
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>
              {t.allowCamera}
            </Text>
          </Pressable>
        )}
      </View>
      {busy ? <ActivityIndicator /> : null}
      {error !== undefined ? (
        <Text style={{ color: theme.danger }}>{t.pairRefused[error]}</Text>
      ) : null}
      {error !== undefined && handled.current !== undefined ? (
        <Button
          label={t.retry}
          onPress={() => void pair(handled.current!, lastMethod.current, true)}
        />
      ) : null}
      <Text style={{ color: theme.ink, fontWeight: '600' }}>{t.pasteLink}</Text>
      <TextInput
        accessibilityLabel={t.pasteLink}
        value={link}
        onChangeText={(value) => {
          setLink(value);
          handled.current = undefined;
        }}
        placeholder="deepseekbot://pair?p=…"
        placeholderTextColor={theme.inkSoft}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={() => void pair(link, 'paste')}
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 12,
          padding: 12,
          fontSize: 16,
          color: theme.ink,
          backgroundColor: theme.surface,
        }}
      />
      <Pressable
        onPress={() => void pair(link, 'paste')}
        disabled={busy || link.trim() === ''}
        accessibilityRole="button"
        style={button}
      >
        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>{t.pair}</Text>
      </Pressable>
    </KeyboardFormScroll>
  );
}
