import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { PairingActions } from '../primitives/pairing-actions';
import { RowIcon } from '../primitives/row-icon';
import { Text } from '../primitives/text';
import { t } from '../strings';
import type { usePairing } from './use-pairing';

export function PairingVerification({
  pairing,
  progress,
}: {
  pairing: ReturnType<typeof usePairing>;
  progress?: string | undefined;
}) {
  const theme = useDesignTheme();
  const [details, setDetails] = useState(false);
  const verification = pairing.verification;
  const fingerprint = verification?.fingerprint ?? pairing.fingerprint;
  const title = verification
    ? t.hostFingerprintTitle
    : fingerprint
      ? t.pairingVerification.waiting
      : t.pairingVerification.connecting;

  return (
    <ScrollView
      key={verification ? 'verify' : fingerprint ? 'approve' : 'connect'}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x6, gap: space.x5 }}
    >
      <View style={{ alignItems: 'center', gap: space.x3, paddingTop: space.x4 }}>
        {progress ? (
          <Text variant="meta" tone="muted">
            {progress}
          </Text>
        ) : null}
        <RowIcon name="computer" size={theme.type.display.line} />
        <Text variant="display" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {title}
        </Text>
        {pairing.computerName ? (
          <Text tone="muted" style={{ textAlign: 'center' }}>
            {pairing.computerName}
          </Text>
        ) : null}
      </View>
      {fingerprint ? (
        <>
          <Text style={{ textAlign: 'center' }}>
            {verification ? t.pairingVerification.compare : t.deviceFingerprintHint}
          </Text>
          <View
            style={{
              padding: space.x5,
              gap: space.x3,
              borderRadius: radius.lg,
              backgroundColor: theme.layer.raised.fill,
            }}
          >
            <Text variant="meta" tone="muted" style={{ textAlign: 'center' }}>
              {verification ? t.pairingVerification.computerKey : t.pairingVerification.phoneKey}
            </Text>
            <Text
              testID="pairing-fingerprint"
              selectable
              style={{ fontFamily: theme.mono, textAlign: 'center' }}
            >
              {fingerprint}
            </Text>
          </View>
        </>
      ) : null}
      {!verification ? <LoadingIndicator accessibilityLabel={title} /> : null}
      <PairingActions
        primary={
          verification
            ? {
                label: t.hostFingerprintConfirm,
                testID: 'pairing-fingerprint-match',
                onPress: () => verification.confirm(true),
              }
            : undefined
        }
        secondary={{
          label: verification ? t.pairingVerification.mismatch : t.cancel,
          testID: 'pairing-fingerprint-cancel',
          onPress: () => (verification ? verification.confirm(false) : pairing.abort()),
        }}
        details={
          fingerprint
            ? {
                label: details ? t.pairingVerification.hideDetails : t.pairingVerification.details,
                testID: 'pairing-fingerprint-details',
                onPress: () => setDetails(!details),
              }
            : undefined
        }
      />
      {details ? <Text tone="muted">{t.pairingVerification.explanation}</Text> : null}
    </ScrollView>
  );
}
