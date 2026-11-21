import type { ReactElement } from 'react';
import type { BridgeActions } from '../../actions.js';
import { GenuiDocumentCard } from '../../genui-document.js';
import { GenuiReportCard } from '../../genui-report.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { ChannelMessage } from '../../store.js';

export function renderGenuiCard({
  genui,
  channelId,
  messageId,
  interactiveReport,
  actions,
  t,
}: {
  genui: NonNullable<ChannelMessage['genui']>;
  channelId: string | undefined;
  messageId: string;
  interactiveReport: boolean;
  actions: BridgeActions | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div className="bh-bubble-body">
      {genui.version === 2 ? (
        <GenuiDocumentCard
          document={genui}
          channelId={channelId ?? ''}
          messageId={messageId}
          {...(interactiveReport && actions ? { actions } : {})}
          t={t}
        />
      ) : (
        <GenuiReportCard
          report={genui}
          channelId={channelId ?? ''}
          messageId={messageId}
          {...(interactiveReport && actions ? { actions } : {})}
          t={t}
        />
      )}
    </div>
  );
}
