import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { readPairingImage, type PairingImageResult } from '../../src/host/pairing-image';
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
import { PairingVerification } from '../../src/ui/shell/pairing-verification';
import { usePairing } from '../../src/ui/shell/use-pairing';
import { useStrings } from '../../src/ui/strings';

export default function PairTailscaleScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const scan = Math.min(width * pairingScan.widthRatio, pairingScan.maxSize);
  const params = useLocalSearchParams<{ p?: string; mode?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState('');
  const [focused, setFocused] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const [imageError, setImageError] =
    useState<Extract<PairingImageResult, { kind: 'error' }>['code']>();
  const imageOperation = useRef<AbortController | undefined>(undefined);
  const active = useRef(false);
  const submitting = useRef(false);
  const deepLinked = useRef(false);
  const pairing = usePairing();

  const pair = async (text: string, method: PairingMethod): Promise<void> => {
    if (!active.current || imageOperation.current || submitting.current) return;
    submitting.current = true;
    setImageError(undefined);
    try {
      const failure = await pairing.pair(text, method);
      if (active.current && failure !== undefined && clearsPastedLink(failure, method)) setLink('');
    } finally {
      submitting.current = false;
    }
  };

  const chooseImage = async (): Promise<void> => {
    if (!active.current || imageOperation.current || submitting.current || pairing.busy) return;
    const operation = new AbortController();
    imageOperation.current = operation;
    setReadingImage(true);
    setImageError(undefined);
    const result = await readPairingImage(operation.signal);
    if (operation.signal.aborted || imageOperation.current !== operation) return;
    imageOperation.current = undefined;
    setReadingImage(false);
    if (result.kind === 'error') setImageError(result.code);
    else if (result.kind === 'link') {
      pairing.forget();
      await pair(result.link, 'image');
    }
  };

  const retry = async (): Promise<void> => {
    if (!active.current || imageOperation.current || submitting.current) return;
    submitting.current = true;
    try {
      await pairing.retry();
    } finally {
      submitting.current = false;
    }
  };

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setFocused(true);
      if (typeof params.p === 'string' && !deepLinked.current) {
        deepLinked.current = true;
        void pair(`deepseekbot://pair?p=${params.p}`, 'deep_link');
      }
      return () => {
        active.current = false;
        imageOperation.current?.abort();
        imageOperation.current = undefined;
        setReadingImage(false);
        setFocused(false);
        pairing.abort();
      };
    }, [params.p]),
  );

  if (pairing.busy) return <PairingVerification pairing={pairing} />;

  return (
    <KeyboardFormScroll
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      <Stack.Screen
        options={{ title: params.mode === 'lan' ? t.pairChoice.lan : t.pairChoice.tailscale }}
      />
      <Text tone="muted">
        {params.mode === 'lan' ? t.pairChoice.lanHint : t.pairChoice.tailscaleHint}
      </Text>
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
            focused &&
            !readingImage && (
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
        <Button
          testID="pair-choose-image"
          label={readingImage ? t.pairImage.reading : t.pairImage.choose}
          busy={readingImage}
          onPress={() => void chooseImage()}
        />
      </View>
      {imageError !== undefined ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {t.pairImage[imageError]}
        </Text>
      ) : pairing.error !== undefined ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {pairingFailureText(pairing.error, pairing.method)}
        </Text>
      ) : null}
      {pairing.canRetry && imageError === undefined ? (
        <Button label={t.retry} disabled={readingImage} onPress={() => void retry()} />
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
            setImageError(undefined);
            pairing.forget();
          }}
          placeholder="deepseekbot://pair?p=…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          editable={!readingImage}
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
        disabled={pairing.busy || readingImage}
      />
      <Button
        label={t.pair}
        tone="primary"
        on="canvas"
        busy={pairing.busy}
        disabled={pairing.busy || readingImage || link.trim() === ''}
        onPress={() => void pair(link, 'paste')}
      />
    </KeyboardFormScroll>
  );
}
