import { Text, TextInput } from '../src/ui/primitives/system-text';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { hostSession } from '../src/host/host-session';
import { hostLooks } from '../src/host/native-host-look';
import { HOST_NAME_MAX, hostLookName, withHostName } from '../src/ui/design/host-look';
import { ConnectionNameField } from '../src/ui/primitives/connection-name-field';
import { nativeCarrier } from '../src/host/native-carrier';
import { pairHost, type PairingFailure } from '../src/host/pairing';
import { clearsPastedLink, pairingFailureText } from '../src/ui/pairing-failure';
import { mobileTelemetry } from '../src/telemetry/native';
import type { PairingMethod } from '../src/telemetry/schema';
import { Button } from '../src/ui/primitives/button';
import { DrawerHeader } from '../src/ui/primitives/drawer-header';
import { useDesignTheme } from '../src/ui/design/theme';
import { KeyboardFormScroll } from '../src/ui/primitives/keyboard-form';
import { cloudAvailable } from '../src/cloud/available';
import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';

function deviceName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

export default function PairScreen() {
  const theme = useTheme();
  const design = useDesignTheme();
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
    if (!result.ok) {
      if (clearsPastedLink(result.code, method)) {
        setLink('');
        handled.current = undefined;
      }
      return setError(result.code);
    }
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

  return (
    <KeyboardFormScroll
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ flex: 1, backgroundColor: design.overlay.fill }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <DrawerHeader
        title={t.pairTitle}
        {...(router.canGoBack() ? { onClose: () => router.back() } : {})}
      />
      {cloudAvailable && (
        <Button label={t.cloud.title} onPress={() => router.dismissTo('/cloud-services')} />
      )}
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
          backgroundColor: design.layer.raised.fill,
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
      {error !== undefined ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: theme.danger }}
        >
          {pairingFailureText(error, lastMethod.current)}
        </Text>
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
      <Button
        label={t.pair}
        tone="primary"
        on="canvas"
        busy={busy}
        disabled={busy || link.trim() === ''}
        onPress={() => void pair(link, 'paste')}
      />
    </KeyboardFormScroll>
  );
}
