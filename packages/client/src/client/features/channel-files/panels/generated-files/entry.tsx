import type { ReactElement } from 'react';
import type { BridgeActions } from '../../../../actions.js';
import { PanelDialog } from '../../../../ds/panel-dialog.js';
import { ChannelFiles } from '../../../../generated-files-panel.js';
import type { BotHarnessTranslate } from '../../../../locale.js';

export function renderChannelFilesDialog(
  channelId: string,
  actions: BridgeActions,
  t: BotHarnessTranslate,
  setFilesOpen: (open: boolean) => void,
): ReactElement {
  return (
    <PanelDialog
      title={t('generatedFiles.title')}
      closeLabel={t('dock.close', { label: t('generatedFiles.title') })}
      onClose={() => setFilesOpen(false)}
      scroll
    >
      <ChannelFiles key={channelId} channelId={channelId} actions={actions} t={t} />
    </PanelDialog>
  );
}

export function renderChannelFilesContent(
  channelId: string,
  actions: BridgeActions,
  t: BotHarnessTranslate,
): ReactElement {
  return <ChannelFiles key={channelId} channelId={channelId} actions={actions} t={t} />;
}
