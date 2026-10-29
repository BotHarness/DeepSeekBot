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
    'success',
    'delete-partial',
    'local-write',
    'session-write',
    'expired-retry',
    'completion-write',
    'environments',
  ];
  const scenario = scenarios.find((value) => value === params.scenario) ?? 'success';
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
        busy={params.pairing !== undefined}
        pairing={params.pairing}
        saved={fixture.saved()}
        results={{}}
        onPair={async () => {}}
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
