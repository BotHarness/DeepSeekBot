import {
  connectionDiagnostic,
  type ConnectionDiagnostic,
} from '../../src/host/connection-diagnostic';
import type { AccountPairResult } from '../../src/ui/primitives/account-panel';
import * as Application from 'expo-application';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import {
  createAccountActionFixture,
  type AccountFixtureScenario,
} from '../../src/host/account-action-fixture';
import { AccountHosts } from '../../src/ui/account-hosts';
import { Button } from '../../src/ui/primitives/button';
import { Text } from '../../src/ui/primitives/text';
import { space } from '../../src/ui/design/tokens';
import { useStrings } from '../../src/ui/strings';

export default function AccountActionsFixtureRoute() {
  if (!__DEV__ || !Application.applicationId?.endsWith('.dev')) return <Redirect href="/" />;
  return <AccountActionsFixture />;
}

function AccountActionsFixture() {
  const t = useStrings();
  const params = useLocalSearchParams<{ scenario?: string; pairing?: string }>();
  const scenarios: AccountFixtureScenario[] = [
    'connection-diagnostics',
    'connection-diagnostics-network',
    'connection-diagnostics-session',
    'connection-diagnostics-invalid',
    'connection-diagnostics-list',
    'success',
    'delete-partial',
    'local-write',
    'session-write',
    'expired-retry',
    'completion-write',
    'environments',
    'linked-computers',
    'linked-computers-refresh-failure',
  ];
  const scenario = scenarios.find((value) => value === params.scenario) ?? 'success';
  const [results, setResults] = useState<Record<string, AccountPairResult>>({});
  const [failures, setFailures] = useState<Record<string, ConnectionDiagnostic>>({});
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);
  const fixture = useMemo(() => createAccountActionFixture(scenario), [scenario, reset]);
  const snapshot = useSyncExternalStore(
    fixture.subscribe,
    fixture.getSnapshot,
    fixture.getSnapshot,
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t.accountFixture.title }} />
      <AccountHosts
        key={scenario}
        account={fixture.account}
        busy={busy || params.pairing !== undefined}
        pairing={params.pairing}
        saved={fixture.saved()}
        results={results}
        failures={failures}
        onClearFailures={() => {
          setResults({});
          setFailures({});
        }}
        onPair={async (hosts) => {
          if (!scenario.startsWith('connection-diagnostics')) return;
          setBusy(true);
          try {
            for (const host of hosts) {
              const result = await fixture.account.offer(host.id, 'QA phone');
              if (!result.ok) {
                setResults((old) => ({ ...old, [host.id]: result.code }));
                setFailures((old) => ({
                  ...old,
                  [host.id]:
                    result.diagnostic ??
                    connectionDiagnostic({
                      code: result.code,
                      detail: result.detail,
                      phase: 'pairing',
                    }),
                }));
              }
            }
          } finally {
            setBusy(false);
          }
        }}
      />
      {scenario === 'environments' ? null : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.x4 }}>
          <Text>{t.accountFixture.notice}</Text>
          <Button
            testID="account-fixture-reset"
            label={t.accountFixture.reset}
            onPress={() => setReset((value) => value + 1)}
          />
          <Text testID="account-fixture-result" selectable>
            {snapshot}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
