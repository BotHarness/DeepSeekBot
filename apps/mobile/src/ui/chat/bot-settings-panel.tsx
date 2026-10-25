import { useFocusEffect, useRouter } from 'expo-router';
import { useMemo, useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { botSettings, errorText } from '../../host/bot-settings';
import { dmChannel } from '../../host/bot-profile';
import { renameBot } from '../../host/bot-name';
import type { HostClient, RosterBot } from '../../host/client';
import { useHostSession } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { ChevronRightIcon, CpuIcon, FolderIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { useComposerContext } from './composer-context';
import { modelLabel, workspaceLabel } from './composer-labels';
import { DmActivitySettings } from './dm-activity-settings';
import { BotNameSetting } from './bot-name-setting';

const ICON = 20;

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
  useFocusEffect(
    useCallback(() => {
      context.reloadModel();
      context.reloadGrants();
    }, [settings]),
  );
  const model = modelLabel(context.model);
  const workspace = workspaceLabel(context.grants);
  const chevron = <ChevronRightIcon color={theme.color.muted} size={ICON} />;
  return (
    <View ref={context.mount} style={{ alignSelf: 'stretch', gap: space.x4 }}>
      <BotNameSetting name={bot.displayName} onSave={(name) => renameBot(client, bot.slug, name)} />
      <SettingsSection title={t.composerContext}>
        <SettingsRow
          title={t.contextModel}
          detail={model}
          accessibilityLabel={`${t.contextModel} · ${bot.displayName} · ${model}`}
          leading={<CpuIcon color={theme.color.fg} size={ICON} />}
          trailing={chevron}
          onPress={() => {
            router.push({ pathname: '/bot/[slug]/model', params: { slug: bot.slug } });
          }}
        />
        <View style={{ borderTopWidth: edge.hairline, borderTopColor: theme.layer.sheet.divider }}>
          <SettingsRow
            title={t.contextWorkspace}
            detail={workspace}
            accessibilityLabel={`${t.contextWorkspace} · ${bot.displayName} · ${workspace}`}
            leading={<FolderIcon color={theme.color.fg} size={ICON} />}
            trailing={chevron}
            onPress={() => {
              router.push({ pathname: '/bot/[slug]/workspace', params: { slug: bot.slug } });
            }}
          />
        </View>
      </SettingsSection>
      {saved == null ? null : (
        <SettingsSection>
          <SettingsRow
            testID="bot-chat-background"
            title={t.chatBackground.title}
            trailing={openingBackground ? <LoadingIndicator /> : chevron}
            onPress={openingBackground ? undefined : () => void openBackground()}
          />
        </SettingsSection>
      )}
      {backgroundError === undefined ? null : (
        <Text accessibilityRole="alert" tone="danger">
          {backgroundError}
        </Text>
      )}
      {saved == null ? null : (
        <DmActivitySettings hostId={saved.hostId} botSlug={bot.slug} name={bot.displayName} />
      )}
    </View>
  );
}
