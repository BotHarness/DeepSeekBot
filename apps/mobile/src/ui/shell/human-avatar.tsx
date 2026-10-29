import { useState } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import { accountProfile, useAccountProfile } from '../../account/native-account-profile';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { AccountAvatar } from './account-avatar';

export { humanInitial } from './human-avatar-initial';

export function HumanAvatarButton({
  loadName,
  onPress,
  testID,
}: {
  loadName: (() => Promise<string | undefined>) | undefined;
  onPress: () => void;
  testID?: string;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const account = useAccountProfile();
  const profile = account.status === 'ready' ? account.profile : null;
  const [name, setName] = useState<string>();
  const mount = useMounted<ViewInstance>(() => {
    let live = true;
    if (accountProfile.getSnapshot().status === 'loading') void accountProfile.refresh();
    loadName?.().then(
      (loaded) => live && setName(loaded),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [loadName]);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.settings}
      style={({ pressed }) => ({
        minWidth: theme.touch,
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View ref={mount}>
        <AccountAvatar
          uri={profile?.avatar}
          name={profile?.name ?? name}
          size={theme.touch - space.x3}
        />
      </View>
    </Pressable>
  );
}
