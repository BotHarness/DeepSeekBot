import { useAccountProfile } from '../../account/native-account-profile';
import { SHEET_GROUP } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { AccountAvatar } from './account-avatar';

export function AccountProfileRow({ onPress }: { onPress(): void }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const state = useAccountProfile();
  const profile = state.status === 'ready' ? state.profile : null;
  const email = state.status === 'ready' ? state.email : undefined;
  const title =
    state.status === 'signed-out'
      ? t.accountProfile.signIn
      : (profile?.name ??
        (state.status === 'ready' ? t.accountProfile.setUp : t.accountProfile.title));
  return (
    <SettingsSection on={SHEET_GROUP}>
      <SettingsRow
        on={SHEET_GROUP}
        testID="settings-account-profile"
        title={title}
        detail={state.status === 'signed-out' ? t.accountProfile.signInHint : email}
        leading={
          <AccountAvatar
            uri={profile?.avatar}
            name={profile?.name ?? email}
            size={theme.touch + space.x2}
          />
        }
        disclosure
        onPress={onPress}
      />
    </SettingsSection>
  );
}
