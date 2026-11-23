import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { creationActions } from '../../host/creation-targets';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { botSourceHref } from './creation-menu-items';
import { CreationRow } from './creation-row';
import { BrowserIcon, FileIcon, GitCommitIcon, PlusIcon } from './icons';
import { useCreationTargets } from './use-creation-targets';

export function BotSourceScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const targets = useCreationTargets();
  const allowed = creationActions(
    hostId ? computerEnvironmentKey(hostId) : 'all',
    targets,
  ).includes('bot');
  const choices = [
    ['blank', PlusIcon],
    ['marketplace', BrowserIcon],
    ['zip', FileIcon],
    ['git', GitCommitIcon],
  ] as const;
  return (
    <>
      <Stack.Screen options={{ title: t.botCreation.title }} />
      <ScrollView
        testID="bot-source-picker"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, gap: space.x2 }}
      >
        {allowed ? (
          choices.map(([source, Icon]) => (
            <CreationRow
              key={source}
              testID={`bot-source-${source}`}
              label={t.chatsCreate[source]}
              description={t.chatsCreate.description[source]}
              icon={<Icon color={theme.color.fg} size={theme.type.title.line} />}
              onPress={() => router.push(botSourceHref(source, hostId))}
            />
          ))
        ) : (
          <Text accessibilityRole="alert">{t.noCreationTargets}</Text>
        )}
      </ScrollView>
    </>
  );
}
