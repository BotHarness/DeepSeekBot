import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  accountProfile,
  uploadedBots,
  useUploadedBots,
} from '../../src/account/native-account-profile';
import { connectAccount } from '../../src/host/native-connect-account';
import { confirmDestructive, showActionMenu } from '../../src/ui/primitives/app-dialog';
import { locale, useStrings } from '../../src/ui/strings';
import { UploadedBotsView, uploadedBotName } from '../../src/ui/shell/uploaded-bots-view';

export default function UploadedBotsScreen() {
  const router = useRouter();
  const t = useStrings();
  const copy = t.accountProfile;
  const state = useUploadedBots();
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  useFocusEffect(
    useCallback(() => {
      void uploadedBots.refresh(locale);
    }, []),
  );
  const remove = (id: string) => {
    setBusyId(id);
    setError(undefined);
    void uploadedBots
      .remove(id)
      .catch(() => setError(copy.uploadsDeleteFailed))
      .finally(() => setBusyId(undefined));
  };
  return (
    <UploadedBotsView
      state={state}
      busyId={busyId}
      error={error}
      actions={{
        onRetry: () => void uploadedBots.refresh(locale),
        onSignIn: () =>
          void connectAccount
            .signIn()
            .then(() => Promise.all([accountProfile.refresh(), uploadedBots.refresh(locale)])),
        onSelect: (item) => {
          const name = uploadedBotName(item);
          showActionMenu(name, [
            ...(item.blocked
              ? []
              : [
                  {
                    text: copy.uploadsView,
                    icon: 'marketplace' as const,
                    onPress: () =>
                      router.push({
                        pathname: '/marketplace-bot',
                        params: { id: item.bot.id, entry: 'all' },
                      }),
                  },
                ]),
            {
              text: copy.uploadsDelete,
              icon: 'delete' as const,
              style: 'destructive' as const,
              onPress: () =>
                confirmDestructive(
                  copy.uploadsDeleteTitle(name),
                  copy.uploadsDeleteBody,
                  copy.uploadsDelete,
                  () => remove(item.bot.id),
                ),
            },
          ]);
        },
      }}
    />
  );
}
