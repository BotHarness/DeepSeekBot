import { useRouter } from 'expo-router';

import { accountProfile, useAccountProfile } from '../../src/account/native-account-profile';
import { SheetScreen } from '../../src/ui/primitives/sheet-screen';
import { AccountNameEditor } from '../../src/ui/shell/account-name-editor';

export default function AccountNameScreen() {
  const router = useRouter();
  const state = useAccountProfile();
  const name = state.status === 'ready' ? (state.profile?.name ?? '') : '';
  return (
    <SheetScreen>
      <AccountNameEditor
        name={name}
        onSave={async (next) => {
          await accountProfile.save({ name: next });
        }}
        onClose={() => router.back()}
      />
    </SheetScreen>
  );
}
