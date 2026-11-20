import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { CopyableFingerprint } from '../primitives/copyable-fingerprint';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { PairingActions } from '../primitives/pairing-actions';
import { RowIcon } from '../primitives/row-icon';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import type { usePairing } from './use-pairing';

export function PairingVerification({
  pairing,
  progress,
}: {
  pairing: ReturnType<typeof usePairing>;
  progress?: string | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [details, setDetails] = useState(false);
  const verification = pairing.verification;
  const fingerprint = verification?.fingerprint ?? pairing.fingerprint;
  const title = pairing.paired
    ? t.pairingVerification.paired
    : verification
      ? t.hostFingerprintTitle
      : fingerprint
        ? t.pairingVerification.waiting
        : t.pairingVerification.connecting;

  return (
    <ScrollView
      key={
        pairing.paired ? 'paired' : verification ? 'verify' : fingerprint ? 'approve' : 'connect'
      }
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
      {pairing.paired ? (
        <PairingActions
          primary={{
            label: t.done,
            testID: 'pairing-done',
            onPress: pairing.leave,
          }}
        />
      ) : null}
      {fingerprint && !pairing.paired ? (
        <>
          <Text style={{ textAlign: 'center' }}>
            {verification ? t.pairingVerification.compare : t.deviceFingerprintHint}
          </Text>
          <CopyableFingerprint
            testID="pairing-fingerprint"
            fingerprint={fingerprint}
            label={
              verification ? t.pairingVerification.computerKey : t.pairingVerification.phoneKey
            }
          />
        </>
      ) : null}
      {!verification && !pairing.paired ? <LoadingIndicator accessibilityLabel={title} /> : null}
      {pairing.paired ? null : (
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
                  label: details
                    ? t.pairingVerification.hideDetails
                    : t.pairingVerification.details,
                  testID: 'pairing-fingerprint-details',
                  onPress: () => setDetails(!details),
                }
              : undefined
          }
        />
      )}
      {details && !pairing.paired ? (
        <Text tone="muted">{t.pairingVerification.explanation}</Text>
      ) : null}
    </ScrollView>
  );
}
