import { View } from 'react-native';

import type { MarketplaceAuthoredBot } from '../../../../../packages/core/src/marketplace/client';
import type { UploadedBotsState } from '../../account/uploaded-bots';
import { fileSize } from '../chat/message-attachments';
import { SHEET_GROUP } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsForm, SettingsFormItem } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Notice } from '../request-parts';
import { useStrings } from '../strings';
import { MarketplaceAvatarImage } from './marketplace-art';

export interface UploadedBotsActions {
  onRetry(): void;
  onSignIn(): void;
  onSelect(item: MarketplaceAuthoredBot): void;
}

export function uploadedBotName(item: MarketplaceAuthoredBot): string {
  return item.bot.displayName ?? item.bot.name;
}

export function UploadedBotsView({
  state,
  busyId,
  error,
  actions,
}: {
  state: UploadedBotsState;
  busyId?: string | undefined;
  error?: string | undefined;
  actions: UploadedBotsActions;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const copy = t.accountProfile;
  if (state.status === 'loading')
    return (
      <SettingsForm testID="uploaded-bots">
        <SettingsFormItem>
          <View style={{ alignItems: 'center', padding: space.x6 }}>
            <LoadingIndicator accessibilityLabel={t.loading} />
          </View>
        </SettingsFormItem>
      </SettingsForm>
    );
  if (state.status === 'signed-out')
    return (
      <SettingsForm testID="uploaded-bots">
        <SettingsSection footer={copy.signInHint} on={SHEET_GROUP}>
          <SettingsRow on={SHEET_GROUP} title={copy.signIn} onPress={actions.onSignIn} />
        </SettingsSection>
      </SettingsForm>
    );
  if (state.status === 'error')
    return (
      <SettingsForm testID="uploaded-bots">
        <SettingsFormItem>
          <Notice tone="danger">{copy.loadFailed}</Notice>
        </SettingsFormItem>
        <SettingsSection on={SHEET_GROUP}>
          <SettingsRow on={SHEET_GROUP} title={copy.retry} onPress={actions.onRetry} />
        </SettingsSection>
      </SettingsForm>
    );
  if (state.bots.length === 0)
    return (
      <SettingsForm testID="uploaded-bots">
        <SettingsSection footer={copy.uploadsFooter} on={SHEET_GROUP}>
          <SettingsRow on={SHEET_GROUP} title={copy.uploadsEmpty} tone="muted" />
        </SettingsSection>
      </SettingsForm>
    );
  return (
    <SettingsForm testID="uploaded-bots">
      {error === undefined ? null : (
        <SettingsFormItem>
          <Notice tone="danger">{error}</Notice>
        </SettingsFormItem>
      )}
      <SettingsSection footer={copy.uploadsFooter} on={SHEET_GROUP}>
        {state.bots.map((item) => (
          <SettingsRow
            key={item.bot.id}
            on={SHEET_GROUP}
            testID={`uploaded-bot-${item.bot.id}`}
            title={uploadedBotName(item)}
            detail={[
              ...(item.blocked ? [copy.uploadsBlocked] : []),
              copy.uploadsMeta(item.files, fileSize(item.bytes), item.bot.pushedAt.slice(0, 10)),
            ].join(' · ')}
            {...(item.blocked ? { detailDot: theme.color.warning } : {})}
            leading={<MarketplaceAvatarImage bot={item.bot} size={theme.touch} />}
            control={busyId === item.bot.id ? { kind: 'busy' } : { kind: 'chevron' }}
            onPress={busyId === undefined ? () => actions.onSelect(item) : undefined}
          />
        ))}
      </SettingsSection>
    </SettingsForm>
  );
}
