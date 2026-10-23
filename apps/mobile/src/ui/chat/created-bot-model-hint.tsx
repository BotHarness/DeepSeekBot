import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useHostSession } from '../../host/host-session';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { creationCopy as copy } from '../shell/bot-creation-copy';
import { t } from '../strings';

export function CreatedBotModelHint({
  slug,
  hostId,
}: {
  slug: string;
  hostId: string | undefined;
}) {
  const { saved } = useHostSession();
  const [shown, setShown] = useState(true);
  if (!shown || saved?.hostId !== hostId) return null;
  return (
    <View style={{ padding: space.x4, gap: space.x2 }}>
      <Text>{copy.model}</Text>
      <Button
        label={copy.setupModel}
        testID="created-bot-model-settings"
        onPress={() => router.push({ pathname: '/bot/[slug]/model', params: { slug } })}
      />
      <Button label={t.close} variant="text" onPress={() => setShown(false)} />
    </View>
  );
}
