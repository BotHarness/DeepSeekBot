import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { cloudError } from '../../cloud/client';
import { targetsFor, type CreationTarget } from '../../host/creation-targets';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { openCloudCreation } from './open-cloud-creation';
import { CreationRow } from './creation-row';
import { CloudIcon, ComputerIcon } from './icons';
import { useCreationTargets } from './use-creation-targets';

export function CreateGroupTargetScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const targets = targetsFor('channel', 'all', useCreationTargets());
  const running = useRef(false);
  const generation = useRef(0);
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
      },
      [],
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const choose = async (target: Extract<CreationTarget, { kind: 'cloud' }>) => {
    if (running.current) return;
    running.current = true;
    const version = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      await openCloudCreation(target, 'channel', () => version === generation.current, true);
    } catch (cause) {
      if (version === generation.current) setError(cloudError(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const iconSize = theme.type.title.line;
  return (
    <>
      <Stack.Screen options={{ title: t.chooseCreationTarget }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5 }}
      >
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        <CreationRow
          testID="create-group-computer"
          label={t.environments}
          icon={<ComputerIcon color={theme.color.fg} size={iconSize} />}
          disabled={busy}
          onPress={() => router.replace({ pathname: '/create-channel', params: { entry: 'all' } })}
        />
        {targets.map((target) =>
          target.kind === 'cloud' ? (
            <CreationRow
              key={target.key}
              testID="create-group-cloud"
              label={target.name}
              icon={<CloudIcon color={theme.color.fg} size={iconSize} />}
              disabled={busy}
              onPress={() => void choose(target)}
            />
          ) : null,
        )}
      </ScrollView>
    </>
  );
}
