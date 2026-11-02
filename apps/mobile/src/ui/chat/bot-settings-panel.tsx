import { useRouter } from 'expo-router';
import { useProfileFocusEffect } from './profile-visibility';
import { useMemo, useCallback, useRef, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { botSettings, errorText } from '../../host/bot-settings';
import { dmChannel } from '../../host/bot-profile';
import { renameBot } from '../../host/bot-name';
import type { HostClient, RosterBot } from '../../host/client';
import { useHostSession } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useComposerContext } from './composer-context';
import { modelLabel } from './composer-labels';
import { DmActivitySettings } from './dm-activity-settings';
import { BotNameSetting } from './bot-name-setting';

export function BotSettingsPanel({ client, bot }: { client: HostClient; bot: RosterBot }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { saved } = useHostSession();
  const settings = useMemo(() => botSettings(client, bot.slug), [client, bot.slug]);
  const context = useComposerContext(settings);
  const router = useRouter();
  const opening = useRef(false);
  const [openingBackground, setOpeningBackground] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string>();
  const openBackground = async () => {
    if (opening.current || saved == null) return;
    opening.current = true;
    setOpeningBackground(true);
    setBackgroundError(undefined);
    try {
      const channelId = await dmChannel(client, bot);
      router.push({
        pathname: '/bot/[slug]/chat-background',
        params: { slug: bot.slug, hostId: saved.hostId, channelId },
      });
    } catch (failure) {
      setBackgroundError(`${t.chatBackground.openFailed} ${errorText(failure)}`);
    } finally {
      opening.current = false;
      setOpeningBackground(false);
    }
  };
  useProfileFocusEffect(
    useCallback(() => {
      context.reloadModel();
    }, [settings]),
  );
  const model = modelLabel(context.model);
  const divided = (key: string, row: ReactNode, first = false) => (
    <View
      key={key}
      style={
        first || Platform.OS === 'android'
          ? undefined
          : { borderTopWidth: edge.hairline, borderTopColor: theme.layer.raised.divider }
      }
    >
      {row}
    </View>
  );
  return (
    <View ref={context.mount} style={{ alignSelf: 'stretch', gap: space.x5 }}>
      <SettingsSection title={t.profileSettingsBot} on="raised">
        {divided(
          'name',
          <BotNameSetting
            on="raised"
            icon="account"
            name={bot.displayName}
            onSave={(name) => renameBot(client, bot.slug, name)}
          />,
          true,
        )}
        {divided(
          'model',
          <SettingsRow
            on="raised"
            title={t.contextModel}
            detail={model}
            accessibilityLabel={`${t.contextModel} · ${bot.displayName} · ${model}`}
            icon="model"
            control={{ kind: 'chevron' }}
            onPress={() => {
              router.push({
                pathname: '/bot/[slug]/model',
                params: { slug: bot.slug, hostId: saved?.hostId },
              });
            }}
          />,
        )}
        {saved == null
          ? null
          : divided(
              'background',
              <SettingsRow
                on="raised"
                testID="bot-chat-background"
                title={t.chatBackground.title}
                icon="background"
                control={{ kind: openingBackground ? 'busy' : 'chevron' }}
                onPress={openingBackground ? undefined : () => void openBackground()}
              />,
            )}
        {saved == null
          ? null
          : divided(
              'notifications',
              <SettingsRow
                on="raised"
                testID="profile-notifications"
                title={t.profileNotifications}
                icon="notifications"
                control={{ kind: 'chevron' }}
                onPress={() =>
                  router.push({
                    pathname: '/bot/[slug]/notifications',
                    params: { slug: bot.slug, hostId: saved.hostId },
                  })
                }
              />,
            )}
      </SettingsSection>
      {backgroundError === undefined ? null : (
        <Text accessibilityRole="alert" tone="danger">
          {backgroundError}
        </Text>
      )}
      {saved == null ? null : (
        <DmActivitySettings
          on="raised"
          hostId={saved.hostId}
          botSlug={bot.slug}
          name={bot.displayName}
        />
      )}
    </View>
  );
}
