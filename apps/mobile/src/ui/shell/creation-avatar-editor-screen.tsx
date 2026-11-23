import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import {
  creationAvatarRecipe,
  type BotAvatarChoice,
} from '@botharness/host-client/bot-avatar-choice';
import { isTiltiesAvatar } from '@botharness/host-client/tilties-avatars';
import { useStrings } from '../strings';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { AvatarCustomizer } from './avatar-customizer';
import { TiltiesPicker } from './tilties-picker';

export function CreationAvatarEditorScreen() {
  const state = useBotCreation();
  const t = useStrings();
  const theme = useDesignTheme();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/create-bot', params: { entry: 'resume' } });
  };
  const save = async (avatar: BotAvatarChoice): Promise<boolean> => {
    const current = botCreation.getSnapshot();
    if (!current.loaded || current.busy || current.record.kind !== 'draft') return false;
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
  const avatar = state.record.draft.avatar;
  if (avatar?.kind === 'photo' && isTiltiesAvatar(avatar.image))
    return (
      <TiltiesPicker
        initial={avatar.image}
        onSave={(image) => save({ kind: 'photo', image })}
        onClose={close}
      />
    );
  return (
    <AvatarCustomizer
      initial={creationAvatarRecipe(avatar)}
      onSave={(recipe) => save({ kind: 'recipe', recipe })}
      onClose={close}
    />
  );
}
