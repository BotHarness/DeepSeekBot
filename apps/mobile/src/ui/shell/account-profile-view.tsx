import type { RefCallback } from 'react';
import { View, type ViewInstance } from 'react-native';

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
import { useDesignTheme } from '../design/theme';
import { AccountAvatar } from './account-avatar';

export interface AccountProfileActions {
  onBack?(): void;
  onSignIn(): void;
  onEditName(): void;
  onRetry(): void;
  onOpenUploads(): void;
}

export interface ChatProfile {
  name: string | undefined;
  avatar: string | undefined;
  hasAvatar: boolean | undefined;
  editor: ReturnType<typeof useAvatarEditor>;
  mount?: RefCallback<ViewInstance>;
  onEditName(): void;
}

function ChatProfileRows({ chat }: { chat: ChatProfile }) {
  const t = useStrings();
  const copy = t.accountProfile;
  const editor = chat.editor;
  return (
    <>
      <SettingsFormItem>
        <View
          ref={chat.mount}
          style={{ alignItems: 'center', gap: space.x2, paddingVertical: space.x3 }}
        >
          <EditableAvatar editor={editor} corner={radius.round} testID="chat-avatar-change">
            <AccountAvatar uri={chat.avatar} name={chat.name} size={profileShell.avatar} />
          </EditableAvatar>
          <Text variant="title">{chat.name ?? ' '}</Text>
          {editor.error === undefined ? null : (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" tone="danger">
              {editor.error}
            </Text>
          )}
        </View>
      </SettingsFormItem>
      <SettingsSection title={copy.chatTitle} footer={copy.chatFooter} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          testID="chat-profile-name"
          title={copy.name}
          control={{ kind: 'value', text: chat.name ?? '', chevron: true }}
          onPress={chat.onEditName}
        />
        <SettingsRow
          on={SHEET_GROUP}
          testID="chat-avatar-choose"
          title={
            chat.hasAvatar === undefined
              ? t.avatarTitle
              : chat.hasAvatar
                ? t.avatarChange
                : t.avatarChoose
          }
          control={editor.busy ? { kind: 'busy' } : { kind: 'chevron' }}
          onPress={editor.busy ? undefined : () => void editor.choose()}
        />
        {chat.hasAvatar === true ? (
          <SettingsRow
            on={SHEET_GROUP}
            testID="chat-avatar-remove"
            title={t.avatarRemove}
            tone="danger"
            onPress={editor.busy ? undefined : () => void editor.remove()}
          />
        ) : null}
      </SettingsSection>
    </>
  );
}

export function AccountProfileView({
  state,
  avatar,
  chat,
  signingIn = false,
  actions,
}: {
  state: AccountProfileState;
  avatar: ReturnType<typeof useAvatarEditor>;
  chat?: ChatProfile | undefined;
  signingIn?: boolean;
  actions: AccountProfileActions;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const copy = t.accountProfile;
  const header = actions.onBack ? (
    <View style={{ paddingHorizontal: space.x5, paddingTop: space.x5 }}>
      <DrawerHeader title={copy.title} onBack={actions.onBack} />
    </View>
  ) : undefined;
  const chatRows = chat === undefined ? null : <ChatProfileRows chat={chat} />;
  if (state.status === 'loading')
    return (
      <SettingsForm header={header} testID="account-profile">
        {chatRows}
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
        {chatRows}
        <SettingsSection title={copy.tobsTitle} footer={copy.signInHint} on={SHEET_GROUP}>
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
        {chatRows}
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
      {chatRows}
      <SettingsSection title={copy.tobsTitle} footer={copy.footer} on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          testID="account-avatar-choose"
          title={t.avatarTitle}
          leading={
            <AccountAvatar
              uri={profile?.avatar}
              name={name ?? email}
              size={theme.touch - space.x3}
            />
          }
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
        <SettingsRow
          on={SHEET_GROUP}
          testID="account-profile-name"
          title={copy.name}
          control={{ kind: 'value', text: name ?? copy.setUp, chevron: true }}
          onPress={actions.onEditName}
        />
        {profile === null ? null : (
          <SettingsRow
            on={SHEET_GROUP}
            title={copy.authorId}
            control={{ kind: 'value', text: `#${profile.id}` }}
          />
        )}
        {email === undefined ? null : (
          <SettingsRow
            on={SHEET_GROUP}
            title={copy.email}
            control={{ kind: 'value', text: email }}
          />
        )}
      </SettingsSection>
      {avatar.error === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{avatar.error}</Notice>
        </SettingsFormItem>
      )}
      <SettingsSection on={SHEET_GROUP}>
        <SettingsRow
          on={SHEET_GROUP}
          testID="account-uploaded-bots"
          title={copy.uploads}
          control={{ kind: 'chevron' }}
          onPress={actions.onOpenUploads}
        />
      </SettingsSection>
    </SettingsForm>
  );
}
