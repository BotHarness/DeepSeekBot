import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { accountProfile, useAccountProfile } from '../../src/account/native-account-profile';
import { useDesignTheme } from '../../src/ui/design/theme';
import { AccountNameEditor } from '../../src/ui/shell/account-name-editor';

export default function AccountNameScreen() {
  const router = useRouter();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const state = useAccountProfile();
  const name = state.status === 'ready' ? (state.profile?.name ?? '') : '';
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.overlay.fill }}>
      <AccountNameEditor
        name={name}
        onSave={async (next) => {
          await accountProfile.save({ name: next });
        }}
        onClose={() => router.back()}
      />
    </View>
  );
}
