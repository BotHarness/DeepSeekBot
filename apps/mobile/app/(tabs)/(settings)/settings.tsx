import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { accountProfile } from '../../../src/account/native-account-profile';
import { SettingsHomeView } from '../../../src/ui/settings-home-view';
import { SettingsTabPage } from '../../../src/ui/shell/settings-tab-page';

export default function SettingsScreen() {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void accountProfile.refresh();
    }, []),
  );
  return (
    <SettingsTabPage>
      <SettingsHomeView onOpen={(route) => router.push(route)} />
    </SettingsTabPage>
  );
}
