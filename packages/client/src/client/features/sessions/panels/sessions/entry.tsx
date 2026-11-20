import { SessionDetail } from '../../../../session-detail.js';
import type { ConversationStateView } from '../../../../store.js';
import type { BridgeActions } from '../../../../actions.js';
import type { BotHarnessTranslate } from '../../../../locale.js';

export function renderSessionPanelDetail(
  sessionDetail: { title: string; sessionId: string },
  sessionOwner: string,
  state: ConversationStateView,
  actions: BridgeActions,
  t: BotHarnessTranslate,
  close: () => void,
) {
  return {
    title: sessionDetail.title,
    close,
    content: (
      <SessionDetail
        key={sessionDetail.sessionId}
        actions={actions}
        botSlug={sessionOwner}
        botName={state.bots.find((item) => item.slug === sessionOwner)?.displayName}
        sessionId={sessionDetail.sessionId}
        t={t}
      />
    ),
  };
}
