import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { accountProfile } from '../../../src/account/native-account-profile';
import { useHostSession } from '../../../src/host/host-session';
import { loadHumanIdentity, useHumanIdentity } from '../../../src/host/human-profile';
import { loadUsage } from '@botharness/host-client/usage';
import { appBuildLabel } from '../../../src/ui/app-build';
import { copyMessage } from '../../../src/ui/chat/message-menu';
import { currentAppBuild } from '../../../src/ui/native-app-build';
import { StatisticsSettings } from '../../../src/ui/shell/statistics-settings';
import { MessageDisplaySetting } from '../../../src/ui/shell/message-display-settings';
import { ActivityCountLink } from '../../../src/ui/shell/activity-count-settings';
import { HapticFeedbackSetting } from '../../../src/ui/shell/haptic-feedback-setting';
import { DeliveryReceiptSetting } from '../../../src/ui/shell/delivery-receipt-setting';
import { SendJumpSetting } from '../../../src/ui/shell/send-jump-setting';
import { HeaderModelSetting } from '../../../src/ui/shell/header-model-setting';
import { SHEET_GROUP } from '../../../src/ui/chat/sheet';
import { SettingsRow } from '../../../src/ui/primitives/settings-row';
import { useStrings } from '../../../src/ui/strings';
import { SettingsView } from '../../../src/ui/settings-view';
import { AccountProfileRow } from '../../../src/ui/shell/account-profile-row';
import { SettingsTabPage } from '../../../src/ui/shell/settings-tab-page';

export default function SettingsScreen() {
  const t = useStrings();
  const router = useRouter();
  const { saved, client } = useHostSession();
  const human = useHumanIdentity(client);
  useFocusEffect(
    useCallback(() => {
      void accountProfile.refresh();
      if (client !== undefined) void loadHumanIdentity(client).catch(() => undefined);
    }, [client]),
  );
  const usage = useMemo(
    () => (client === undefined ? undefined : () => loadUsage(client, 'week')),
    [client],
  );
  return (
    <SettingsTabPage>
      <SettingsView
        profile={
          <AccountProfileRow
            chat={{ name: human.identity?.displayName, avatar: human.avatar, mount: human.mount }}
            onPress={() => router.push('/settings/profile')}
          />
        }
        statistics={<StatisticsSettings />}
        messageDisplay={<MessageDisplaySetting />}
        sendJump={<SendJumpSetting />}
        headerModel={<HeaderModelSetting />}
        activityCount={<ActivityCountLink />}
        hapticFeedback={<HapticFeedbackSetting />}
        deliveryReceipts={<DeliveryReceiptSetting />}
        chatBackground={
          <SettingsRow
            on={SHEET_GROUP}
            title={t.chatBackground.global}
            icon="background"
            disclosure
            onPress={() => router.push('/settings/chat-background')}
          />
        }
        key={saved?.hostId}
        loadUsage={usage}
        version={appBuildLabel(currentAppBuild())}
        actions={{
          onUsage: () => router.push('/settings/usage'),
          onAppIcon: () => router.push('/settings/app-icon'),
          onNotifications: () => router.push('/settings/notifications'),
          onStorage: () => router.push('/settings/storage'),
          onModelProviders: () => router.push('/settings/model-providers'),
          onModels: () => router.push('/settings/models'),
          onPrompts: () => router.push('/settings/prompts'),
          onCopyVersion: copyMessage,
        }}
      />
    </SettingsTabPage>
  );
}
