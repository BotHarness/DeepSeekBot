import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { autoApprovalTemplateTitle } from './approval-template-entry.js';
import { Note } from './ds/note.js';
import { ActivityListDismiss } from './activity-list-detail-controls.js';
import type { BotHarnessTranslate } from './locale.js';
import type { HumanAttentionItem } from './store.js';

export function autoRejectionMeta(item: HumanAttentionItem, t: BotHarnessTranslate): string {
  const detail = item.autoRejection;
  if (detail === undefined) return item.summary;
  return t('activityList.autoRejection.meta', {
    tool: detail.toolName,
    template: autoApprovalTemplateTitle(t, detail.template),
  });
}

export function AllowAutoRejectionButton({
  item,
  actions,
  t,
  onDone,
  onError,
}: {
  item: HumanAttentionItem;
  actions: Pick<BridgeActions, 'allowAutoRejectionOnce'>;
  t: BotHarnessTranslate;
  onDone?: () => void;
  onError: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const allow = async (): Promise<void> => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await actions.allowAutoRejectionOnce(item);
      onDone?.();
    } catch {
      onError();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Button variant="primary" size="sm" type="button" disabled={busy} onClick={() => void allow()}>
      {t('activityList.autoRejection.allow')}
    </Button>
  );
}

export function ActivityListAutoRejection({
  source,
  actions,
  t,
  title,
  onClose,
}: {
  source: HumanAttentionItem;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  title: string;
  onClose: () => void;
}): ReactElement {
  const [failed, setFailed] = useState(false);
  const detail = source.autoRejection;
  return (
    <section className="bh-activity-list-reply" aria-label={title}>
      <div className="bh-activity-list-reply-header">
        <h2>{title}</h2>
        <ActivityListDismiss source={source} actions={actions} t={t} onClose={onClose} />
      </div>
      <p>{autoRejectionMeta(source, t)}</p>
      <p>{detail?.reason ?? source.summary}</p>
      {detail === undefined ? null : (
        <pre className="bh-tool-approval-input" aria-label={t('activityList.autoRejection.input')}>
          {detail.input}
        </pre>
      )}
      <Note>{t('activityList.autoRejection.hint')}</Note>
      {failed ? <Note tone="danger">{t('activityList.failed')}</Note> : null}
      <div className="bh-activity-list-reply-actions">
        <AllowAutoRejectionButton
          item={source}
          actions={actions}
          t={t}
          onDone={onClose}
          onError={() => setFailed(true)}
        />
      </div>
    </section>
  );
}
