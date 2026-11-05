import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { pairingDiagnostics } from '../../host/pairing-detail';
import type { PairingFailure } from '../../host/pairing';
import type { PairingMethod } from '../../telemetry/schema';
import { space } from '../design/tokens';
import { pairingFailureText } from '../pairing-failure';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function PairingFailureNotice({
  error,
  detail,
  method,
}: {
  error: PairingFailure;
  detail: string | undefined;
  method: PairingMethod;
}) {
  const t = useStrings();
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void Clipboard.setStringAsync(
      pairingDiagnostics({
        code: error,
        detail,
        method,
        platform: Platform.OS,
        osVersion: Device.osVersion,
        appVersion: nativeApplicationVersion,
        appBuild: nativeBuildVersion,
      }),
    ).then(
      () => setCopied(true),
      () => undefined,
    );
  return (
    <View style={{ gap: space.x2 }}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
        {pairingFailureText(error, method)}
      </Text>
      {detail !== undefined ? (
        <Text testID="pair-failure-detail" variant="meta" tone="muted" selectable>
          {t.pairFailureDetail(detail)}
        </Text>
      ) : null}
      {error === 'lan-permission-denied' ? (
        <Button
          testID="pair-open-settings"
          label={t.openLocalNetworkSettings}
          onPress={() => void Linking.openSettings().catch(() => undefined)}
        />
      ) : null}
      <Button
        testID="pair-copy-diagnostics"
        variant="text"
        label={copied ? t.pairDiagnosticsCopied : t.copyPairDiagnostics}
        onPress={copy}
      />
    </View>
  );
}
