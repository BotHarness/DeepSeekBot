import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useHostSession } from '../src/host/host-session';
import { memberPairingOffer, type MemberPairingOffer } from '../src/host/team-client';
import { qrCode, radius, space } from '../src/ui/design/tokens';
import { useMounted } from '../src/ui/mounted';
import { Button } from '../src/ui/primitives/button';
import { SheetHeader } from '../src/ui/primitives/sheet-header';
import { SettingsForm, SettingsFormItem } from '../src/ui/primitives/settings-form';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { Text } from '../src/ui/primitives/text';
import { useStrings } from '../src/ui/strings';

const QR_SIZE = 220;

export default function MemberPairingScreen() {
  const t = useStrings();
  const copy = t.memberPairing;
  const router = useRouter();
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const session = useHostSession(hostId);
  const [offer, setOffer] = useState<MemberPairingOffer>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = async (): Promise<void> => {
    const client = session.client;
    if (!client) return setFailed(true);
    setBusy(true);
    setFailed(false);
    const result = await memberPairingOffer(client);
    setBusy(false);
    if (result.ok) setOffer(result.value);
    else setFailed(true);
  };
  const mount = useMounted(() => {
    void load();
    return () => {};
  }, [session.client]);
  const expires =
    offer === undefined
      ? ''
      : new Date(offer.expiresAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        });
  return (
    <SheetScreen onMount={mount}>
      <SettingsForm
        header={<SheetHeader title={copy.title} onClose={() => router.back()} />}
        testID="member-pairing"
      >
        <SettingsFormItem>
          <View style={{ alignItems: 'center', gap: space.x4, paddingHorizontal: space.x5 }}>
            <Text tone="muted" style={{ textAlign: 'center' }}>
              {copy.hint}
            </Text>
            {offer ? (
              <View
                testID="member-pairing-qr"
                accessible
                accessibilityRole="image"
                accessibilityLabel={copy.qrLabel}
                style={{
                  padding: space.x4,
                  borderRadius: radius.md,
                  backgroundColor: qrCode.paper,
                }}
              >
                <Svg
                  width={QR_SIZE}
                  height={QR_SIZE}
                  viewBox={`0 0 ${offer.qr.size} ${offer.qr.size}`}
                >
                  <Path d={offer.qr.path} fill={qrCode.ink} />
                </Svg>
              </View>
            ) : null}
            {offer ? (
              <Text variant="meta" tone="muted">
                {copy.expires.replace('{time}', expires)}
              </Text>
            ) : null}
            {failed ? (
              <Text accessibilityRole="alert" tone="danger">
                {copy.failed}
              </Text>
            ) : null}
            <Button
              testID="member-pairing-refresh"
              label={offer ? copy.refresh : t.retry}
              busy={busy}
              disabled={busy}
              onPress={() => void load()}
            />
          </View>
        </SettingsFormItem>
      </SettingsForm>
    </SheetScreen>
  );
}
