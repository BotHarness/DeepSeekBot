import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useReducer, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { connectInput } from '@botharness/host-client/connect-input';
import { readPairingImage, type PairingImageResult } from '../../host/pairing-image';
import { registerPairingLinkReceiver } from '../../host/pairing-deep-link';
import type { PairingMethod } from '@botharness/host-client/telemetry/schema';
import { HOST_NAME_MAX } from '@botharness/host-client/ui/design/host-look';
import { useDesignTheme } from '../design/theme';
import { pairingScan, radius, space } from '../design/tokens';
import { clearsPastedLink } from '../pairing-failure';
import { Button } from '../primitives/button';
import { ConnectionNameField } from '../primitives/connection-name-field';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { useKeyboardFormSubmit } from '../primitives/keyboard-form-submit';
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
  const handledDeepLinks = useRef(new Set<string>());
  const pendingDeepLinks = useRef(new Set<string>());
  const [deepLinkRevision, checkDeepLinks] = useReducer((revision: number) => revision + 1, 0);
  const enqueueDeepLink = useCallback((payload: string) => {
    if (handledDeepLinks.current.has(payload) || pendingDeepLinks.current.has(payload)) return;
    pendingDeepLinks.current.add(payload);
    checkDeepLinks();
  }, []);
  const pairing = usePairing({ deferLeave: () => pendingDeepLinks.current.size > 0 });
  const { abort } = pairing;
  const submit = useKeyboardFormSubmit();
  const named = link.trim() !== '' && connectInput(link).kind === 'pairing';

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
      if (pendingDeepLinks.current.size > 0) checkDeepLinks();
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
      if (pendingDeepLinks.current.size > 0) checkDeepLinks();
    }
  };

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setFocused(true);
      const unregister = registerPairingLinkReceiver(enqueueDeepLink);
      return () => {
        unregister();
        active.current = false;
        pendingDeepLinks.current.clear();
        imageOperation.current?.abort();
        imageOperation.current = undefined;
        setReadingImage(false);
        setFocused(false);
        abort();
      };
    }, [abort, enqueueDeepLink]),
  );

  useFocusEffect(
    useCallback(() => {
      if (deepLink !== undefined) enqueueDeepLink(deepLink);
      if (!active.current || pairing.busy || imageOperation.current || submitting.current) return;
      const payload = pendingDeepLinks.current.values().next().value;
      if (payload === undefined) return;
      pendingDeepLinks.current.delete(payload);
      handledDeepLinks.current.add(payload);
      void pair(`deepseekbot://pair?p=${encodeURIComponent(payload)}`, 'deep_link');
    }, [deepLink, deepLinkRevision, enqueueDeepLink, pairing.busy, readingImage]),
  );

  if (pairing.busy) return <PairingVerification pairing={pairing} />;

  return (
    <KeyboardFormScroll
      {...submit.scroll}
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
      <View style={{ gap: space.x2 }} onLayout={submit.onFieldLayout}>
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
      <View onLayout={submit.onSubmitLayout}>
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
