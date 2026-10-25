import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { pairAccountSelection } from '../../src/host/account-pairing';
import type { ConnectHost } from '../../src/host/connect-account';
import { useHostSession } from '../../src/host/host-session';
import { connectAccount } from '../../src/host/native-connect-account';
import { AccountHosts } from '../../src/ui/account-hosts';
import type { AccountPairResult } from '../../src/ui/primitives/account-panel';
import { PairingVerification } from '../../src/ui/shell/pairing-verification';
import { usePairing } from '../../src/ui/shell/use-pairing';
import { useStrings } from '../../src/ui/strings';

export default function PairAccountScreen() {
  const t = useStrings();
  const pairing = usePairing({ stayOnPage: true, preventDuplicates: true });
  const session = useHostSession();
  const params = useLocalSearchParams<{ account?: string }>();
  const requested = useRef(false);
  const batch = useRef<AbortController | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [results, setResults] = useState<Record<string, AccountPairResult>>({});
  const add = async (hosts: ConnectHost[]) => {
    if (batch.current) return;
    const operation = new AbortController();
    batch.current = operation;
    setBusy(true);
    let index = 0;
    try {
      await pairAccountSelection({
        hosts,
        signal: operation.signal,
        pair: (host) => {
          setProgress(t.pairAccount.progress(++index, hosts.length));
          return pairing.pair(`account:${host.id}`, 'account', true, host.id);
        },
        result: (host, result) => setResults((old) => ({ ...old, [host.id]: result })),
      });
      if (!operation.signal.aborted) pairing.finishSetup();
    } finally {
      if (batch.current === operation) {
        batch.current = undefined;
        setBusy(false);
        setProgress(undefined);
      }
    }
  };
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setResults({});
      if (typeof params.account === 'string' && !requested.current) {
        requested.current = true;
        void connectAccount
          .hosts()
          .then((listed) => {
            if (live && listed.ok) {
              const host = listed.value.find((host) => host.id === params.account);
              if (host) void add([host]);
            }
          })
          .catch(() => undefined);
      }
      return () => {
        live = false;
        batch.current?.abort();
        pairing.abort();
      };
    }, [params.account]),
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t.pairAccount.computers }} />
      {pairing.busy ? <PairingVerification pairing={pairing} progress={progress} /> : null}
      <View style={{ flex: 1, display: pairing.busy ? 'none' : 'flex' }}>
        <AccountHosts
          account={connectAccount}
          busy={busy}
          saved={session.hosts}
          results={results}
          onPair={add}
        />
      </View>
    </View>
  );
}
