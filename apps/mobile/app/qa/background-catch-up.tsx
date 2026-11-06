import * as Application from 'expo-application';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { runBackgroundCatchUpNow } from '../../src/host/native-background-catch-up';
import { Button } from '../../src/ui/primitives/button';
import { Text } from '../../src/ui/primitives/text';
import { space } from '../../src/ui/design/tokens';
import { useStrings } from '../../src/ui/strings';

export default function BackgroundCatchUpFixtureRoute() {
  if (!__DEV__ || !Application.applicationId?.endsWith('.dev')) return <Redirect href="/" />;
  return <BackgroundCatchUpFixture />;
}

function BackgroundCatchUpFixture() {
  const t = useStrings();
  const [result, setResult] = useState('');
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.x4, gap: space.x3 }}>
      <Stack.Screen options={{ title: t.backgroundCatchUpFixture.title }} />
      <Text>{t.backgroundCatchUpFixture.notice}</Text>
      <Button
        testID="background-catch-up-run"
        label={t.backgroundCatchUpFixture.run}
        onPress={() =>
          void runBackgroundCatchUpNow()
            .catch(() => false)
            .then((started) =>
              setResult(
                started
                  ? t.backgroundCatchUpFixture.started
                  : t.backgroundCatchUpFixture.unavailable,
              ),
            )
        }
      />
      <Text testID="background-catch-up-result" selectable>
        {result}
      </Text>
    </ScrollView>
  );
}
