import { useFocusEffect, useRouter } from 'expo-router';
import { useMemo, useCallback } from 'react';
import { View } from 'react-native';

import { botSettings } from '../../host/bot-settings';
import type { HostClient, RosterBot } from '../../host/client';
import { useHostSession } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { ChevronRightIcon, CpuIcon, FolderIcon } from '../shell/icons';
import { t } from '../strings';
import { useComposerContext } from './composer-context';
import { modelLabel, workspaceLabel } from './composer-labels';
import { DmActivitySettings } from './dm-activity-settings';

const ICON = 20;

export function BotSettingsPanel({ client, bot }: { client: HostClient; bot: RosterBot }) {
  const theme = useDesignTheme();
  const { saved } = useHostSession();
  const settings = useMemo(() => botSettings(client, bot.slug), [client, bot.slug]);
  const context = useComposerContext(settings);
  const router = useRouter();
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
      {saved == null || !bot.dmChannelId ? null : (
        <SettingsSection title={t.chatBackground.title}>
          <SettingsRow
            title={t.chatBackground.title}
            trailing={chevron}
            onPress={() =>
              router.push({
                pathname: '/bot/[slug]/chat-background',
                params: { slug: bot.slug, hostId: saved.hostId, channelId: bot.dmChannelId },
              })
            }
          />
        </SettingsSection>
      )}
      {saved == null ? null : (
        <DmActivitySettings hostId={saved.hostId} botSlug={bot.slug} name={bot.displayName} />
      )}
    </View>
  );
}
