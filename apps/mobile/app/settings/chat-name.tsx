import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHostSession } from '../../src/host/host-session';
import { saveHumanName, useHumanIdentity } from '../../src/host/human-profile';
import { useDesignTheme } from '../../src/ui/design/theme';
import { AccountNameEditor } from '../../src/ui/shell/account-name-editor';

export default function ChatNameScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { client } = useHostSession();
  const human = useHumanIdentity(client);
  return (
    <View
      ref={human.mount}
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.overlay.fill }}
    >
      {human.identity === undefined ? null : (
        <AccountNameEditor
          name={human.identity.defaultDisplayName ?? ''}
          onSave={async (next) => {
            if (client === undefined) throw new Error('host-unavailable');
            await saveHumanName(client, next);
          }}
          onClose={() => router.back()}
        />
      )}
    </View>
  );
}
