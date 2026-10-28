import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { dataUrlBytes } from '../../src/account/account-profile';
import { accountProfile, useAccountProfile } from '../../src/account/native-account-profile';
import { connectAccount } from '../../src/host/native-connect-account';
import { pickAvatarImage } from '../../src/host/pick-avatar-image';
import { useAvatarEditor } from '../../src/ui/chat/avatar-editor';
import { AccountProfileView } from '../../src/ui/shell/account-profile-view';

export default function AccountProfileScreen() {
  const router = useRouter();
  const state = useAccountProfile();
  const [signingIn, setSigningIn] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void accountProfile.refresh();
    }, []),
  );
  const avatar = useAvatarEditor({
    pick: pickAvatarImage,
    save: async (image) => {
      await accountProfile.saveAvatar(image === null ? null : dataUrlBytes(image));
    },
  });
  return (
    <AccountProfileView
      state={state}
      avatar={avatar}
      signingIn={signingIn}
      actions={{
        onBack: () => router.back(),
        onRetry: () => void accountProfile.refresh(),
        onEditName: () => router.push('/settings/profile-name'),
        onSignIn: () => {
          setSigningIn(true);
          void connectAccount
            .signIn()
            .then(() => accountProfile.refresh())
            .finally(() => setSigningIn(false));
        },
      }}
    />
  );
}
