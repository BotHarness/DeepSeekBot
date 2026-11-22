import type { ReactElement } from 'react';
import { PanelDialog } from '../../../../ds/panel-dialog.js';
import type { BotHarnessTranslate } from '../../../../locale.js';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from '../../../../channel-sidebar.js';

export function renderBotInboxPanelDialog(
  inboxEntry: ChannelSidebarEntry,
  dockBotSlug: string,
  dockEntryProps: ChannelSidebarEntryProps,
  t: BotHarnessTranslate,
  setInboxOpen: (open: boolean) => void,
): ReactElement {
  return (
    <PanelDialog
      title={t('entry.botInbox')}
      closeLabel={t('dock.close', { label: t('entry.botInbox') })}
      onClose={() => setInboxOpen(false)}
      scroll
      secondary={
        inboxEntry.headerAction && <inboxEntry.headerAction key={dockBotSlug} {...dockEntryProps} />
      }
    >
      <inboxEntry.component key={dockBotSlug} {...dockEntryProps} flush />
    </PanelDialog>
  );
}
