import { TextField } from '../src/ui/primitives/text-field';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';

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
import { KeyboardFormScroll } from '../src/ui/primitives/keyboard-form';
import { cloudAvailable } from '../src/cloud/available';
import { t } from '../src/ui/strings';
import { useDesignTheme } from '../src/ui/design/theme';
import { pairingScan, radius, space } from '../src/ui/design/tokens';
import { Text } from '../src/ui/primitives/text';

function deviceName(): string {
  return Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
}

export default function PairScreen() {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const scan = Math.min(width * pairingScan.widthRatio, pairingScan.maxSize);
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
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      <DrawerHeader
        title={t.pairTitle}
        {...(router.canGoBack() ? { onClose: () => router.back() } : {})}
      />
      <View
        style={{
          alignItems: 'center',
          gap: space.x4,
          padding: space.x5,
          borderRadius: radius.lg,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <View
          style={{
            width: scan,
            height: scan,
            borderRadius: radius.lg,
            overflow: 'hidden',
            backgroundColor: theme.layer.well.fill,
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
              style={{ padding: space.x5, minHeight: theme.touch, justifyContent: 'center' }}
            >
              <Text tone="accent" strong style={{ textAlign: 'center' }}>
                {t.allowCamera}
              </Text>
            </Pressable>
          )}
        </View>
        <Text variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          {t.pairHint}
        </Text>
      </View>
      {error !== undefined ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {pairingFailureText(error, lastMethod.current)}
        </Text>
      ) : null}
      {error !== undefined && handled.current !== undefined ? (
        <Button
          label={t.retry}
          onPress={() => void pair(handled.current!, lastMethod.current, true)}
        />
      ) : null}
      <View style={{ gap: space.x2 }}>
        <Text variant="meta" tone="muted" accessibilityRole="header">
          {t.pasteLink}
        </Text>
        <TextField
          accessibilityLabel={t.pasteLink}
          value={link}
          onChangeText={(value) => {
            setLink(value);
            handled.current = undefined;
          }}
          placeholder="deepseekbot://pair?p=…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => void pair(link, 'paste')}
        />
        <Text variant="meta" tone="muted">
          {t.pasteLinkHint}
        </Text>
      </View>
      <ConnectionNameField
        value={connectionName}
        onChange={setConnectionName}
        maxLength={HOST_NAME_MAX}
        disabled={busy}
      />
      <Button
        label={t.pair}
        tone="primary"
        on="canvas"
        busy={busy}
        disabled={busy || link.trim() === ''}
        onPress={() => void pair(link, 'paste')}
      />
      {cloudAvailable && (
        <Button
          label={t.cloud.title}
          variant="text"
          onPress={() => router.dismissTo('/cloud-services')}
        />
      )}
    </KeyboardFormScroll>
  );
}
