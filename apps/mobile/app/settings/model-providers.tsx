import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { loadModelProviders } from '@botharness/host-client/model-providers';
import { loadSubscriptionAccounts } from '@botharness/host-client/subscription-accounts';
import { useHostSession } from '../../src/host/host-session';
import { SheetNote } from '../../src/ui/chat/sheet';
import {
  ModelProvidersSettings,
  type ModelProvidersPort,
} from '../../src/ui/model-providers-settings';
import { useStrings } from '../../src/ui/strings';

export default function ModelProvidersScreen() {
  const t = useStrings();
  const router = useRouter();
  const { saved, client } = useHostSession();
  const [focusTick, setFocusTick] = useState(0);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) setFocusTick((tick) => tick + 1);
      focused.current = true;
    }, []),
  );
  const port = useMemo<ModelProvidersPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            providers: () => loadModelProviders(client),
            accounts: () => loadSubscriptionAccounts(client),
            openAccount: (id) =>
              router.push({ pathname: '/settings/model-provider-account', params: { id } }),
          },
    [client, router],
  );
  if (port === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return <ModelProvidersSettings key={saved?.hostId} port={port} focusTick={focusTick} />;
}
