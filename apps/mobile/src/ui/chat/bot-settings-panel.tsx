import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { botSettings } from '../../host/bot-settings';
import type { HostClient, RosterBot } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { edge } from '../design/tokens';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { ChevronRightIcon, CpuIcon, FolderIcon } from '../shell/icons';
import { t } from '../strings';
import { useComposerContext } from './composer-context';
import { modelLabel, workspaceLabel } from './composer-labels';
import { ModelSheet } from './model-sheet';
import { WorkspaceSheet } from './workspace-sheet';

const ICON = 20;

export function BotSettingsPanel({ client, bot }: { client: HostClient; bot: RosterBot }) {
  const theme = useDesignTheme();
  const settings = useMemo(() => botSettings(client, bot.slug), [client, bot.slug]);
  const context = useComposerContext(settings);
  const [sheet, setSheet] = useState<'model' | 'workspace'>();
  const [workspaceOpened, setWorkspaceOpened] = useState(0);
  const model = modelLabel(context.model);
  const workspace = workspaceLabel(context.grants);
  const chevron = <ChevronRightIcon color={theme.color.muted} size={ICON} />;
  return (
    <View ref={context.mount} style={{ alignSelf: 'stretch' }}>
      <SettingsSection title={t.composerContext}>
        <SettingsRow
          title={t.contextModel}
          detail={model}
          accessibilityLabel={`${t.contextModel} · ${bot.displayName} · ${model}`}
          leading={<CpuIcon color={theme.color.fg} size={ICON} />}
          trailing={chevron}
          onPress={() => {
            if (context.model.status !== 'ready') context.reloadModel();
            setSheet('model');
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
              context.openWorkspace();
              setWorkspaceOpened((count) => count + 1);
              setSheet('workspace');
            }}
          />
        </View>
      </SettingsSection>
      <ModelSheet
        visible={sheet === 'model'}
        botName={bot.displayName}
        model={context.model}
        onRetry={context.reloadModel}
        onChoose={async (choice, entry) => {
          await settings.chooseModel(choice, entry);
          context.reloadModel();
        }}
        onPreset={async (presetId) => {
          await settings.applyPreset(presetId);
          context.reloadModel();
        }}
        onClose={() => setSheet(undefined)}
      />
      <WorkspaceSheet
        key={workspaceOpened}
        visible={sheet === 'workspace'}
        botName={bot.displayName}
        settings={settings}
        grants={context.grants}
        access={context.access}
        templates={context.templates}
        onRetryGrants={context.reloadGrants}
        onGrantsChanged={context.reloadGrants}
        onAccess={context.setAccess}
        onTemplates={context.setTemplates}
        onClose={() => setSheet(undefined)}
      />
    </View>
  );
}
