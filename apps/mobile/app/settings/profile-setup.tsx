import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHostSession } from '../../src/host/host-session';
import {
  finishHumanProfileSetup,
  saveHumanAvatar,
  saveHumanName,
  useHumanIdentity,
} from '../../src/host/human-profile';
import { pickAvatarImage } from '../../src/host/pick-avatar-image';
import { useAvatarEditor } from '../../src/ui/chat/avatar-editor';
import { useDesignTheme } from '../../src/ui/design/theme';
import { ProfileSetupView } from '../../src/ui/shell/profile-setup-view';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { client } = useHostSession();
  const human = useHumanIdentity(client);
  const editor = useAvatarEditor({
    pick: pickAvatarImage,
    save: async (image) => {
      if (client !== undefined) await saveHumanAvatar(client, image);
    },
  });
  const finish = async (name?: string) => {
    if (client === undefined) throw new Error('host-unavailable');
    if (name !== undefined && name !== human.identity?.displayName)
      await saveHumanName(client, name);
    await finishHumanProfileSetup(client);
    router.back();
  };
  return (
    <View
      ref={human.mount}
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.overlay.fill }}
    >
      {human.identity === undefined ? null : (
        <ProfileSetupView
          name={human.identity.displayName}
          avatar={human.avatar}
          editor={editor}
          onDone={(name) => finish(name)}
          onLater={() => finish()}
        />
      )}
    </View>
  );
}
