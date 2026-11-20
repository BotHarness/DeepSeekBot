import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useHostSession } from '../src/host/host-session';
import { accountHostLookTarget } from '../src/host/account-host-look';
import { connectAccount } from '../src/host/native-connect-account';
import { hostLooks, useHostLook } from '../src/host/native-host-look';
import { useDesignTheme } from '../src/ui/design/theme';
import { space } from '../src/ui/design/tokens';
import { Notice } from '../src/ui/request-parts';
import { HostLookEditor } from '../src/ui/shell/host-look-editor';
import { useStrings } from '../src/ui/strings';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { LoadingIndicator } from '../src/ui/primitives/loading-indicator';

export default function HostLookScreen() {
  const t = useStrings();
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId?: string; account?: string }>();
  const theme = useDesignTheme();
  const { saved, hosts } = useHostSession();
  const [resolvedAccount, setResolvedAccount] = useState<string>();
  const [accountHost, setAccountHost] = useState<{
    account: string;
    hostId: string;
    hostName: string;
  }>();
  useFocusEffect(
    useCallback(() => {
      let current = true;
      setAccountHost(undefined);
      setResolvedAccount(undefined);
      if (params.account !== undefined)
        void connectAccount
          .hosts()
          .then((listed) => {
            if (!current || !listed.ok) return;
            const host = listed.value.find((host) => host.id === params.account);
            if (host) setAccountHost({ account: host.id, ...accountHostLookTarget(host) });
          })
          .catch(() => undefined)
          .finally(() => {
            if (current) setResolvedAccount(params.account);
          });
      return () => {
        current = false;
      };
    }, [params.account]),
  );
  const host =
    params.account !== undefined
      ? accountHost?.account === params.account
        ? accountHost
        : undefined
      : params.hostId === undefined
        ? (saved ?? undefined)
        : hosts.find((entry) => entry.hostId === params.hostId);
  const hostId = host?.hostId ?? '';
  const look = useHostLook(hostId);
  if (params.account !== undefined && resolvedAccount !== params.account)
    return (
      <SheetScreen>
        <LoadingIndicator />
      </SheetScreen>
    );
  if (host === undefined)
    return (
      <View style={{ flex: 1, padding: space.x5, backgroundColor: theme.color.base }}>
        <Notice tone="danger">{t.hostLookMissing}</Notice>
      </View>
    );
  return (
    <SheetScreen>
      <HostLookEditor
        key={hostId}
        hostName={host.hostName}
        look={look}
        actions={{
          onSave: async (next) => {
            if (params.account !== undefined) {
              const listed = await connectAccount.hosts();
              if (
                !listed.ok ||
                !listed.value.some(
                  (entry) =>
                    entry.id === params.account && accountHostLookTarget(entry).hostId === hostId,
                )
              )
                throw new Error(t.hostLookMissing);
            }
            await hostLooks.refresh();
            await hostLooks.update(hostId, () => next);
          },
          onClose: () => router.back(),
        }}
      />
    </SheetScreen>
  );
}
