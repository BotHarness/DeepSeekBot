import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import { connectInput } from '../../host/connect-input';
import { readPairingImage, type PairingImageResult } from '../../host/pairing-image';
import type { PairingMethod } from '@botharness/host-client/telemetry/schema';
import { HOST_NAME_MAX } from '@botharness/host-client/ui/design/host-look';
import { useDesignTheme } from '../design/theme';
import { pairingScan, radius, space } from '../design/tokens';
import { clearsPastedLink } from '../pairing-failure';
import { Button } from '../primitives/button';
import { ConnectionNameField } from '../primitives/connection-name-field';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { labelInField } from '../primitives/field-label';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { DesktopPath } from './desktop-path';
import { PairingFailureNotice } from './pairing-failure-notice';
import { PairingVerification } from './pairing-verification';
import { usePairing } from './use-pairing';

export function PairScanner({
  steps,
  deepLink,
  header,
  children,
}: {
  steps: readonly string[];
  deepLink?: string;
  header?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scan = Math.min(width * pairingScan.widthRatio, pairingScan.maxSize);
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
  const scroll = useRef<KeyboardAwareScrollViewRef>(null);
  const [linkBottom, setLinkBottom] = useState(0);
  const [submitBottom, setSubmitBottom] = useState(0);
  const named = link.trim() !== '' && connectInput(link).kind === 'pairing';
  const submitClearance =
    submitBottom > linkBottom
      ? Math.max(theme.touch + space.x6 * 2, submitBottom - linkBottom + space.x3)
      : undefined;

  const pair = async (text: string, method: PairingMethod): Promise<void> => {
    if (!active.current || imageOperation.current || submitting.current) return;
    const input = connectInput(text);
    if (input.kind === 'invitation') {
      setLink('');
      router.push(input.path);
      return;
    }
    if (input.kind === 'address') {
      router.push({ pathname: '/pair/team', params: { address: input.address } });
      return;
    }
    submitting.current = true;
    setImageError(undefined);
    try {
      const failure = await pairing.pair(input.text, method);
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
      if (deepLink !== undefined && !deepLinked.current) {
        deepLinked.current = true;
        void pair(`deepseekbot://pair?p=${deepLink}`, 'deep_link');
      }
      return () => {
        active.current = false;
        imageOperation.current?.abort();
        imageOperation.current = undefined;
        setReadingImage(false);
        setFocused(false);
        pairing.abort();
      };
    }, [deepLink]),
  );

  if (pairing.busy) return <PairingVerification pairing={pairing} />;

  return (
    <KeyboardFormScroll
      ref={scroll}
      {...(submitClearance === undefined ? {} : { bottomOffset: submitClearance })}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      {header}
      <View
        style={{
          alignItems: 'center',
          gap: space.x4,
          padding: space.x5,
          borderRadius: radius.lg,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <DesktopPath steps={steps} />
        {permission?.granted ? (
          <View
            style={{
              width: scan,
              height: scan,
              borderRadius: radius.lg,
              overflow: 'hidden',
              backgroundColor: theme.layer.well.fill,
            }}
          >
            {focused && !readingImage ? (
              <CameraView
                style={{ width: '100%', height: '100%' }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={pairing.busy ? undefined : ({ data }) => void pair(data, 'qr')}
              />
            ) : null}
          </View>
        ) : (
          <Button
            testID="pair-allow-camera"
            label={t.allowCamera}
            tone="primary"
            on="canvas"
            onPress={() => void requestPermission()}
          />
        )}
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
        <PairingFailureNotice
          key={`${pairing.error}:${pairing.errorDetail ?? ''}`}
          error={pairing.error}
          detail={pairing.errorDetail}
          method={pairing.method}
        />
      ) : null}
      {pairing.canRetry && imageError === undefined ? (
        <Button label={t.retry} disabled={readingImage} onPress={() => void retry()} />
      ) : null}
      <View
        style={{ gap: space.x2 }}
        onLayout={({ nativeEvent }) =>
          setLinkBottom(nativeEvent.layout.y + nativeEvent.layout.height)
        }
      >
        {labelInField ? null : (
          <Text variant="meta" tone="muted" accessibilityRole="header">
            {t.pasteLink}
          </Text>
        )}
        <TextField
          testID="pair-link-input"
          accessibilityLabel={t.pasteLink}
          value={link}
          onChangeText={(value) => {
            setLink(value);
            setImageError(undefined);
            pairing.forget();
          }}
          placeholder={t.pasteLinkPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          editable={!readingImage}
          onSubmitEditing={() => void pair(link, 'paste')}
        />
      </View>
      {named ? (
        <ConnectionNameField
          value={pairing.connectionName}
          onChange={pairing.setConnectionName}
          maxLength={HOST_NAME_MAX}
          disabled={pairing.busy || readingImage}
        />
      ) : null}
      <View
        onLayout={({ nativeEvent }) => {
          const bottom = nativeEvent.layout.y + nativeEvent.layout.height;
          if (bottom === submitBottom) return;
          setSubmitBottom(bottom);
          requestAnimationFrame(() => scroll.current?.assureFocusedInputVisible());
        }}
      >
        <Button
          testID="pair-link-submit"
          label={t.pairContinue}
          tone="primary"
          on="canvas"
          busy={pairing.busy}
          disabled={pairing.busy || readingImage || link.trim() === ''}
          onPress={() => void pair(link, 'paste')}
        />
      </View>
      {children}
    </KeyboardFormScroll>
  );
}
