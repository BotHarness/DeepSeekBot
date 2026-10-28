import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { ScrollView } from "react-native";

import { cloudAvailable } from "../../src/cloud/available";
import { useHostSession } from "../../src/host/host-session";
import { SHEET_GROUP } from "../../src/ui/chat/sheet";
import { useDesignTheme } from "../../src/ui/design/theme";
import { space } from "../../src/ui/design/tokens";
import { Button } from "../../src/ui/primitives/button";
import {
  SettingsRow,
  SettingsSection,
} from "../../src/ui/primitives/settings-row";
import { Text } from "../../src/ui/primitives/text";
import { PairingGuide } from "../../src/ui/shell/pairing-guide";
import { useStrings } from "../../src/ui/strings";

export default function PairChoiceScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const firstPairing = useHostSession().hosts.length === 0;
  const params = useLocalSearchParams<{ p?: string; account?: string }>();
  const forwarded = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (forwarded.current) return;
      if (typeof params.p === "string") {
        forwarded.current = true;
        router.push({ pathname: "/pair/tailscale", params: { p: params.p } });
      } else if (typeof params.account === "string") {
        forwarded.current = true;
        router.push({
          pathname: "/pair/account",
          params: { account: params.account },
        });
      }
    }, [params.p, params.account]),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      <Text tone="muted">{t.pairChoice.intro}</Text>
      <SettingsSection on={SHEET_GROUP}>
        <SettingsRow
          testID="pair-choice-lan"
          on={SHEET_GROUP}
          title={t.pairChoice.lan}
          detail={t.pairChoice.lanDetail}
          icon="qr"
          disclosure
          onPress={() =>
            router.push({
              pathname: "/pair/tailscale",
              params: { mode: "lan" },
            })
          }
        />
        <SettingsRow
          testID="pair-choice-account"
          on={SHEET_GROUP}
          title={t.pairChoice.account}
          detail={t.pairChoice.accountDetail}
          icon="account"
          disclosure
          onPress={() => router.push("/pair/account")}
        />
        <SettingsRow
          testID="pair-choice-tailscale"
          on={SHEET_GROUP}
          title={t.pairChoice.tailscale}
          detail={t.pairChoice.tailscaleDetail}
          icon="qr"
          disclosure
          onPress={() => router.push("/pair/tailscale")}
        />
      </SettingsSection>
      <PairingGuide initiallyOpen={firstPairing} />
      {cloudAvailable && (
        <Button
          label={t.cloud.title}
          variant="text"
          onPress={() => router.dismissTo("/cloud-services")}
        />
      )}
    </ScrollView>
  );
}
