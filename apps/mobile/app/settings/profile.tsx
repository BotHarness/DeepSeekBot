import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { dataUrlBytes } from '../../src/account/account-profile';
import { accountProfile, useAccountProfile } from '../../src/account/native-account-profile';
import { connectAccount } from '../../src/host/native-connect-account';
import { pickAvatarImage } from '../../src/host/pick-avatar-image';
import { useAvatarEditor } from '../../src/ui/chat/avatar-editor';
import { AccountProfileView } from '../../src/ui/shell/account-profile-view';
import { useHostSession } from '../../src/host/host-session';
import { saveHumanAvatar, useHumanIdentity } from '../../src/host/human-profile';

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
  const { client } = useHostSession();
  const human = useHumanIdentity(client);
  const chatAvatar = useAvatarEditor({
    pick: pickAvatarImage,
    save: async (image) => {
      if (client !== undefined) await saveHumanAvatar(client, image);
    },
  });
  return (
    <AccountProfileView
      state={state}
      avatar={avatar}
      chat={
        client === undefined
          ? undefined
          : {
              name: human.identity?.displayName,
              avatar: human.avatar,
              hasAvatar: human.identity?.avatarVersion !== undefined,
              editor: chatAvatar,
              mount: human.mount,
              onEditName: () => router.push('/settings/chat-name'),
            }
      }
      signingIn={signingIn}
      actions={{
        onRetry: () => void accountProfile.refresh(),
        onEditName: () => router.push('/settings/profile-name'),
        onOpenUploads: () => router.push('/settings/uploaded-bots'),
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
