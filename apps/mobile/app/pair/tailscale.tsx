import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import type { PairingMethod } from '../../src/telemetry/schema';
import { HOST_NAME_MAX } from '../../src/ui/design/host-look';
import { useDesignTheme } from '../../src/ui/design/theme';
import { pairingScan, radius, space } from '../../src/ui/design/tokens';
import { clearsPastedLink, pairingFailureText } from '../../src/ui/pairing-failure';
import { Button } from '../../src/ui/primitives/button';
import { ConnectionNameField } from '../../src/ui/primitives/connection-name-field';
import { KeyboardFormScroll } from '../../src/ui/primitives/keyboard-form';
import { Text } from '../../src/ui/primitives/text';
import { TextField } from '../../src/ui/primitives/text-field';
import { usePairing } from '../../src/ui/shell/use-pairing';
import { t } from '../../src/ui/strings';

export default function PairTailscaleScreen() {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const scan = Math.min(width * pairingScan.widthRatio, pairingScan.maxSize);
  const params = useLocalSearchParams<{ p?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState('');
  const [focused, setFocused] = useState(false);
  const deepLinked = useRef(false);
  const pairing = usePairing();

  const pair = async (text: string, method: PairingMethod): Promise<void> => {
    const failure = await pairing.pair(text, method);
    if (failure !== undefined && clearsPastedLink(failure, method)) setLink('');
  };

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (typeof params.p === 'string' && !deepLinked.current) {
        deepLinked.current = true;
        void pair(`deepseekbot://pair?p=${params.p}`, 'deep_link');
      }
      return () => {
        setFocused(false);
        pairing.abort();
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
      <Text tone="muted">{t.pairChoice.tailscaleHint}</Text>
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
                onBarcodeScanned={pairing.busy ? undefined : ({ data }) => void pair(data, 'qr')}
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
      {pairing.error !== undefined ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {pairingFailureText(pairing.error, pairing.method)}
        </Text>
      ) : null}
      {pairing.canRetry ? <Button label={t.retry} onPress={() => void pairing.retry()} /> : null}
      <View style={{ gap: space.x2 }}>
        <Text variant="meta" tone="muted" accessibilityRole="header">
          {t.pasteLink}
        </Text>
        <TextField
          accessibilityLabel={t.pasteLink}
          value={link}
          onChangeText={(value) => {
            setLink(value);
            pairing.forget();
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
        value={pairing.connectionName}
        onChange={pairing.setConnectionName}
        maxLength={HOST_NAME_MAX}
        disabled={pairing.busy}
      />
      <Button
        label={t.pair}
        tone="primary"
        on="canvas"
        busy={pairing.busy}
        disabled={pairing.busy || link.trim() === ''}
        onPress={() => void pair(link, 'paste')}
      />
    </KeyboardFormScroll>
  );
}
