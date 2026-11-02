import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import { creationAvatarRecipe, type BotAvatarChoice } from '../../host/bot-avatar-choice';
import { type AvatarRecipe } from '../../../../../packages/core/src/bots/avatar-appearance';
import { useStrings } from '../strings';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { AvatarCustomizer } from './avatar-customizer';

export function CreationAvatarEditorScreen() {
  const state = useBotCreation();
  const t = useStrings();
  const theme = useDesignTheme();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/create-bot', params: { entry: 'resume' } });
  };
  const save = async (recipe: AvatarRecipe): Promise<boolean> => {
    const current = botCreation.getSnapshot();
    if (!current.loaded || current.busy || current.record.kind !== 'draft') return false;
    const avatar: BotAvatarChoice = { kind: 'recipe', recipe };
    await botCreation.setAvatar(avatar);
    const next = botCreation.getSnapshot();
    return (
      next.error === undefined &&
      next.record.kind === 'draft' &&
      next.record.draft.avatar === avatar
    );
  };
  if (!state.loaded || state.record.kind !== 'draft')
    return (
      <View style={{ flex: 1, padding: space.x5, backgroundColor: theme.color.base }}>
        <Stack.Screen options={{ title: t.avatarEditor.title }} />
        <Text>{t.avatarEditor.unavailable}</Text>
      </View>
    );
  return (
    <AvatarCustomizer
      initial={creationAvatarRecipe(state.record.draft.avatar)}
      onSave={save}
      onClose={close}
    />
  );
}
