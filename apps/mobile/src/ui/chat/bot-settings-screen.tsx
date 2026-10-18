import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { botSettings } from '../../host/bot-settings';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { SheetPage } from '../primitives/sheet-page';
import { t } from '../strings';
import { useComposerContext } from './composer-context';
import { ModelSheet } from './model-sheet';
import { WorkspaceSheet } from './workspace-sheet';
import { SheetNote } from './sheet';

export function BotSettingsScreen({ kind }: { kind: 'model' | 'workspace' }) {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  const settings = useMemo(
    () => (client === undefined ? undefined : botSettings(client, slug)),
    [client, slug],
  );
  const context = useComposerContext(settings);
  useFocusEffect(
    useCallback(() => {
      if (kind === 'workspace') context.openWorkspace();
    }, [settings, kind]),
  );
  if (bot === undefined || settings === undefined) return <SheetNote>{t.noBot}</SheetNote>;
  return (
    <View ref={context.mount} style={{ flex: 1 }}>
      {kind === 'model' ? (
        <ModelSheet
          page={SheetPage}
          visible
          botName={bot.displayName}
          model={context.model}
          onRetry={context.reloadModel}
          onChoose={async (choice, entry) => {
            await settings.chooseModel(choice, entry);
          }}
          onPreset={async (presetId) => {
            await settings.applyPreset(presetId);
          }}
          onClose={() => router.back()}
        />
      ) : (
        <WorkspaceSheet
          page={SheetPage}
          visible
          botName={bot.displayName}
          settings={settings}
          grants={context.grants}
          access={context.access}
          templates={context.templates}
          onRetryGrants={context.reloadGrants}
          onGrantsChanged={context.reloadGrants}
          onAccess={context.setAccess}
          onTemplates={context.setTemplates}
          onClose={() => router.back()}
        />
      )}
    </View>
  );
}
