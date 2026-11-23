import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { cloudAvailable } from '../../src/cloud/available';
import { pairingLinkMode } from '@botharness/host-client/pairing';
import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { Button } from '../../src/ui/primitives/button';
import { SettingsRow, SettingsSection } from '../../src/ui/primitives/settings-row';
import { Text } from '../../src/ui/primitives/text';
import { PairScanner } from '../../src/ui/shell/pair-scanner';
import { useStrings } from '../../src/ui/strings';

export default function PairChoiceScreen() {
  const t = useStrings();
  const router = useRouter();
  const [linkError, setLinkError] = useState(false);
  const params = useLocalSearchParams<{ p?: string; account?: string }>();
  const forwarded = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (forwarded.current) return;
      if (typeof params.p === 'string') {
        forwarded.current = true;
        const mode = pairingLinkMode(params.p);
        router.push({
          pathname: '/pair/tailscale',
          params: mode === undefined ? { p: params.p } : { p: params.p, mode },
        });
      } else if (typeof params.account === 'string') {
        forwarded.current = true;
        router.push({
          pathname: '/pair/account',
          params: { account: params.account },
        });
      }
    }, [params.p, params.account]),
  );

  return (
    <PairScanner steps={t.pairChoice.connectPath}>
      <SettingsSection on={SHEET_GROUP}>
        <SettingsRow
          testID="pair-choice-account"
          on={SHEET_GROUP}
          title={t.pairChoice.account}
          detail={t.pairChoice.accountDetail}
          icon="account"
          disclosure
          onPress={() => router.push('/pair/account')}
        />
        <SettingsRow
          testID="pair-guide-open"
          on={SHEET_GROUP}
          title={t.pairGuide.open}
          detail={t.pairChoice.needs}
          icon="open"
          onPress={() => {
            setLinkError(false);
            void Linking.openURL(t.pairGuide.url).catch(() => setLinkError(true));
          }}
        />
      </SettingsSection>
      {linkError ? (
        <Text accessibilityRole="alert" tone="danger">
          {t.pairGuide.linkError}
        </Text>
      ) : null}
      {cloudAvailable && (
        <Button
          label={t.cloud.title}
          variant="text"
          onPress={() => router.dismissTo('/cloud-services')}
        />
      )}
    </PairScanner>
  );
}
