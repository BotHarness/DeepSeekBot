import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import { ActionButton, ActionGroup } from './ds/action-button.js';
import { space, color, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { sessionMaintenanceText, useSessionMaintenance } from './session-maintenance.js';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  notice: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
});

export function PendingApply({
  botSlug,
  actions,
  t,
  onApplied,
}: {
  botSlug: string;
  actions: Pick<BridgeActions, 'compactBot' | 'newBotSession'>;
  t: BotHarnessTranslate;
  onApplied(): void;
}): ReactElement {
  const maintenance = useSessionMaintenance(actions, `dm-${botSlug}`, botSlug);
  const run = (action: 'compact' | 'new-session'): void => {
    void maintenance.run(action).then(onApplied);
  };
  return (
    <div {...stylex.props(styles.root)} data-prompt-apply-now="">
      <ActionGroup>
        <ActionButton
          icon="archive"
          busy={maintenance.pending === 'compact'}
          disabled={maintenance.pending !== undefined}
          onClick={() => run('compact')}
        >
          {t('prompts.applyCompact')}
        </ActionButton>
        <ActionButton
          icon="plus"
          busy={maintenance.pending === 'new-session'}
          disabled={maintenance.pending !== undefined}
          onClick={() => run('new-session')}
        >
          {t('prompts.applyNewSession')}
        </ActionButton>
      </ActionGroup>
      {maintenance.notice === undefined ? null : (
        <p role="status" {...stylex.props(styles.notice)}>
          {sessionMaintenanceText(maintenance.notice, t)}
        </p>
      )}
    </div>
  );
}
