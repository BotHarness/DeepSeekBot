import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Note } from './ds/note.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ApprovalCardView } from './store.js';
import { approvalStateKey } from './approval-mask-text.js';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    maxWidth: '420px',
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    minWidth: 0,
  },
  title: {
    margin: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  meta: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
});

export function MaskedApprovalCard({
  approval,
  t,
}: {
  approval: ApprovalCardView;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.card)} data-approval-masked={approval.kind} role="group">
      <p {...stylex.props(styles.title)}>{t(`approval.masked.${approval.kind}`)}</p>
      <p {...stylex.props(styles.meta)}>{t(approvalStateKey(approval.state))}</p>
    </div>
  );
}

export function ApprovalDecider({
  approval,
  t,
}: {
  approval: ApprovalCardView | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (approval === undefined || approval.masked || approval.decidedBy === undefined) return null;
  return (
    <p {...stylex.props(styles.meta)} data-approval-decider={approval.decidedBy.humanId}>
      {t('approval.decidedBy', {
        name: approval.decidedBy.displayName ?? t('team.otherMember'),
      })}
    </p>
  );
}

export function OpaqueToolWarning({
  approval,
  t,
}: {
  approval: ApprovalCardView | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (approval === undefined || approval.masked || !approval.opaque || approval.state !== 'pending')
    return null;
  return <Note tone="warning">{t('approval.opaqueWarning')}</Note>;
}
