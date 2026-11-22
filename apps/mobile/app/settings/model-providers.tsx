import { useMemo } from 'react';

import { loadModelProviders } from '@botharness/host-client/model-providers';
import {
  cancelAccountSignIn,
  loadSubscriptionAccounts,
  refreshAccountQuota,
  signInAccount,
} from '@botharness/host-client/subscription-accounts';
import { useHostSession } from '../../src/host/host-session';
import { SheetNote } from '../../src/ui/chat/sheet';
import {
  ModelProvidersSettings,
  type ModelProvidersPort,
} from '../../src/ui/model-providers-settings';
import { useStrings } from '../../src/ui/strings';

export default function ModelProvidersScreen() {
  const t = useStrings();
  const { saved, client } = useHostSession();
  const port = useMemo<ModelProvidersPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            providers: () => loadModelProviders(client),
            accounts: () => loadSubscriptionAccounts(client),
            refresh: (id) => refreshAccountQuota(client, id),
            signIn: (id) => signInAccount(client, id),
            cancelSignIn: (id) => cancelAccountSignIn(client, id),
          },
    [client],
  );
  if (port === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return <ModelProvidersSettings key={saved?.hostId} port={port} />;
}
