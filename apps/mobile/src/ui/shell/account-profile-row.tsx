import type { RefCallback } from 'react';
import { View, type ViewInstance } from 'react-native';

import { useAccountProfile } from '../../account/native-account-profile';
import { SHEET_GROUP } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { AccountAvatar } from './account-avatar';

export interface ChatIdentity {
  name: string | undefined;
  avatar: string | undefined;
  mount?: RefCallback<ViewInstance> | undefined;
}

export function AccountProfileRow({
  onPress,
  chat,
}: {
  onPress(): void;
  chat?: ChatIdentity | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const state = useAccountProfile();
  const profile = state.status === 'ready' ? state.profile : null;
  const email = state.status === 'ready' ? state.email : undefined;
  const signedOut = state.status === 'signed-out';
  const named = chat?.name;
  const title =
    named ??
    (signedOut
      ? t.accountProfile.signIn
      : (profile?.name ??
        (state.status === 'ready' ? t.accountProfile.setUp : t.accountProfile.title)));
  const detail = signedOut
    ? named === undefined
      ? t.accountProfile.signInHint
      : t.accountProfile.tobsSignedOut
    : email;
  return (
    <SettingsSection on={SHEET_GROUP}>
      <SettingsRow
        on={SHEET_GROUP}
        testID="settings-account-profile"
        title={title}
        detail={detail}
        leading={
          <View ref={chat?.mount}>
            <AccountAvatar
              uri={chat?.avatar ?? profile?.avatar}
              name={named ?? profile?.name ?? email}
              size={theme.touch + space.x2}
            />
          </View>
        }
        disclosure
        onPress={onPress}
      />
    </SettingsSection>
  );
}
