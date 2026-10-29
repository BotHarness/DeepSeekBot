import { View } from 'react-native';

import type { AccountProfileState } from '../../account/account-profile';
import { SHEET_GROUP } from '../chat/sheet';
import type { useAvatarEditor } from '../chat/avatar-editor';
import { EditableAvatar } from '../chat/avatar-editor';
import { profileShell, radius, space } from '../design/tokens';
import { DrawerHeader } from '../primitives/drawer-header';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsForm, SettingsFormItem } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { Notice } from '../request-parts';
import { useStrings } from '../strings';
import { AccountAvatar } from './account-avatar';

export interface AccountProfileActions {
  onBack?(): void;
  onSignIn(): void;
  onEditName(): void;
  onRetry(): void;
}

export function AccountProfileView({
  state,
  avatar,
  signingIn = false,
  actions,
}: {
  state: AccountProfileState;
  avatar: ReturnType<typeof useAvatarEditor>;
  signingIn?: boolean;
  actions: AccountProfileActions;
}) {
  const t = useStrings();
  const copy = t.accountProfile;
  const header = actions.onBack ? (
    <View style={{ paddingHorizontal: space.x5, paddingTop: space.x5 }}>
      <DrawerHeader title={copy.title} onBack={actions.onBack} />
    </View>
  ) : undefined;
  if (state.status === 'loading')
    return (
      <SettingsForm header={header} testID="account-profile">
        <SettingsFormItem>
          <View style={{ alignItems: 'center', padding: space.x6 }}>
            <LoadingIndicator accessibilityLabel={t.loading} />
          </View>
        </SettingsFormItem>
      </SettingsForm>
    );
  if (state.status === 'signed-out')
    return (
      <SettingsForm header={header} testID="account-profile">
        <SettingsSection footer={copy.signInHint} on={SHEET_GROUP}>
          <SettingsRow
            on={SHEET_GROUP}
            testID="account-profile-sign-in"
            title={copy.signIn}
            control={signingIn ? { kind: 'busy' } : undefined}
            onPress={signingIn ? undefined : actions.onSignIn}
          />
        </SettingsSection>
      </SettingsForm>
    );
  if (state.status === 'error')
    return (
      <SettingsForm header={header} testID="account-profile">
        <SettingsFormItem>
          <Notice tone="danger">{copy.loadFailed}</Notice>
        </SettingsFormItem>
        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow on={SHEET_GROUP} title={copy.retry} onPress={actions.onRetry} />
        </SettingsSection>
      </SettingsForm>
    );
  const { profile, email } = state;
  const name = profile?.name;
  return (
    <SettingsForm header={header} testID="account-profile">
      <SettingsFormItem>
        <View style={{ alignItems: 'center', gap: space.x2, paddingVertical: space.x3 }}>
          <EditableAvatar editor={avatar} corner={radius.round} testID="account-avatar-change">
            <AccountAvatar uri={profile?.avatar} name={name ?? email} size={profileShell.avatar} />
          </EditableAvatar>
          <Text variant="title">{name ?? copy.setUp}</Text>
          {profile === null ? null : <Text variant="meta" tone="muted">{`#${profile.id}`}</Text>}
          {avatar.error === undefined ? null : (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
              {avatar.error}
            </Text>
          )}
        </View>
      </SettingsFormItem>
      <SettingsSection title={t.avatarTitle} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          testID="account-avatar-choose"
          title={t.avatarChange}
          control={avatar.busy ? { kind: 'busy' } : { kind: 'chevron' }}
          onPress={avatar.busy ? undefined : () => void avatar.choose()}
        />
        {profile?.avatar == null ? null : (
          <SettingsRow
            on={SHEET_GROUP}
            testID="account-avatar-remove"
            title={t.avatarRemove}
            tone="danger"
            onPress={avatar.busy ? undefined : () => void avatar.remove()}
          />
        )}
      </SettingsSection>
      <SettingsSection footer={copy.footer} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          testID="account-profile-name"
          title={copy.name}
          control={{ kind: 'value', text: name ?? copy.setUp, chevron: true }}
          onPress={actions.onEditName}
        />
        {email === undefined ? null : (
          <SettingsRow
            on={SHEET_GROUP}
            title={copy.email}
            control={{ kind: 'value', text: email }}
          />
        )}
      </SettingsSection>
    </SettingsForm>
  );
}
