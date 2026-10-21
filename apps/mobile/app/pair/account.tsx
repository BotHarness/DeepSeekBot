import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';

import { connectAccount } from '../../src/host/native-connect-account';
import { AccountHosts } from '../../src/ui/account-hosts';
import { HOST_NAME_MAX } from '../../src/ui/design/host-look';
import { useDesignTheme } from '../../src/ui/design/theme';
import { space } from '../../src/ui/design/tokens';
import { pairingFailureText } from '../../src/ui/pairing-failure';
import { Button } from '../../src/ui/primitives/button';
import { ConnectionNameField } from '../../src/ui/primitives/connection-name-field';
import { KeyboardFormScroll } from '../../src/ui/primitives/keyboard-form';
import { Text } from '../../src/ui/primitives/text';
import { usePairing } from '../../src/ui/shell/use-pairing';
import { t } from '../../src/ui/strings';

export default function PairAccountScreen() {
  const theme = useDesignTheme();
  const pairing = usePairing();
  const params = useLocalSearchParams<{ account?: string }>();
  const requested = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (typeof params.account === 'string' && !requested.current) {
        requested.current = true;
        void pairing.pair(`account:${params.account}`, 'account', true, params.account);
      }
      return pairing.abort;
    }, [params.account]),
  );

  return (
    <KeyboardFormScroll
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      <Text tone="muted">{t.pairChoice.accountComputer}</Text>
      <AccountHosts
        account={connectAccount}
        busy={pairing.busy}
        onPair={(host) => void pairing.pair(`account:${host.id}`, 'account', true, host.id)}
      />
      {pairing.error !== undefined ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
          {pairingFailureText(pairing.error, pairing.method)}
        </Text>
      ) : null}
      {pairing.canRetry ? <Button label={t.retry} onPress={() => void pairing.retry()} /> : null}
      <ConnectionNameField
        value={pairing.connectionName}
        onChange={pairing.setConnectionName}
        maxLength={HOST_NAME_MAX}
        disabled={pairing.busy}
      />
    </KeyboardFormScroll>
  );
}
