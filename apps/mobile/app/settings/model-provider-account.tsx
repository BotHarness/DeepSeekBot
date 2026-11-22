import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import {
  cancelAccountSignIn,
  loadSubscriptionAccounts,
  refreshAccountQuota,
  signInAccount,
} from '@botharness/host-client/subscription-accounts';
import { useHostSession } from '../../src/host/host-session';
import { SheetNote } from '../../src/ui/chat/sheet';
import {
  ProviderAccountSettings,
  type ProviderAccountPort,
} from '../../src/ui/model-providers-settings';
import { useStrings } from '../../src/ui/strings';

export default function ModelProviderAccountScreen() {
  const t = useStrings();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { saved, client } = useHostSession();
  const port = useMemo<ProviderAccountPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            accounts: () => loadSubscriptionAccounts(client),
            refresh: (account) => refreshAccountQuota(client, account),
            signIn: (account) => signInAccount(client, account),
            cancelSignIn: (account) => cancelAccountSignIn(client, account),
          },
    [client],
  );
  if (port === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return <ProviderAccountSettings key={`${saved?.hostId}:${id}`} port={port} id={id} />;
}
