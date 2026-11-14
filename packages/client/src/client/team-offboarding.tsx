import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { TextField } from './ds/field.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { TeamMember } from './team-bridge.js';
import {
  confirmPurge,
  deactivateMember,
  loadPurgePreview,
  loadTransferPreview,
  reactivateMember,
  resetMemberPassword,
  transferMember,
  type PurgePreview,
  type TransferPreview,
} from './team-offboarding-bridge.js';
import { teamErrorText } from './team-settings.js';

const styles = stylex.create({
  actions: { display: 'flex', flexWrap: 'wrap', gap: space.x2, minWidth: 0 },
  title: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  group: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  danger: { color: color.danger },
  secret: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.well,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    color: color.fg,
    overflowWrap: 'anywhere',
    userSelect: 'all',
  },
  list: { margin: 0, paddingInlineStart: space.x5, color: color.fg, fontSize: text.bodySize },
});

type Action =
  | { kind: 'reset' }
  | { kind: 'revealed'; password: string }
  | { kind: 'deactivate' }
  | { kind: 'reactivate' }
  | { kind: 'transfer'; preview: TransferPreview }
  | { kind: 'purge'; preview: PurgePreview };

export function MemberActions({
  call,
  t,
  member,
  members,
  onChanged,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  member: TeamMember;
  members: readonly TeamMember[];
  onChanged(): void;
}): ReactElement {
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = (work: () => Promise<void>): void => {
    setBusy(true);
    setError(undefined);
    work()
      .catch((failure: unknown) => setError(teamErrorText(t, failure)))
      .finally(() => setBusy(false));
  };
  const close = (): void => {
    setAction(undefined);
    setError(undefined);
  };
  const deactivated = member.status === 'deactivated';
  const errorNote = error === undefined ? undefined : <Note tone="danger">{error}</Note>;
  return (
    <div {...stylex.props(styles.group)} data-member-actions={member.username}>
      <p {...stylex.props(styles.title)}>{t('team.offboard.title')}</p>
      <div {...stylex.props(styles.actions)}>
        <Button variant="outline" disabled={busy} onClick={() => setAction({ kind: 'reset' })}>
          {t('team.offboard.reset')}
        </Button>
        {deactivated ? (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAction({ kind: 'reactivate' })}
            >
              {t('team.offboard.reactivate')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  setAction({
                    kind: 'transfer',
                    preview: await loadTransferPreview(call, member.humanId),
                  }),
                )
              }
            >
              {t('team.offboard.transfer')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  setAction({
                    kind: 'purge',
                    preview: await loadPurgePreview(call, member.humanId),
                  }),
                )
              }
            >
              <span {...stylex.props(styles.danger)}>{t('team.offboard.purge')}</span>
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setAction({ kind: 'deactivate' })}
          >
            <span {...stylex.props(styles.danger)}>{t('team.offboard.deactivate')}</span>
          </Button>
        )}
      </div>
      {action === undefined && error !== undefined ? errorNote : null}
      {action?.kind === 'reset' ? (
        <ConfirmDialog
          title={t('team.offboard.resetTitle', { name: member.displayName })}
          description={t('team.offboard.resetBody')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('team.offboard.reset')}
          busy={busy}
          error={errorNote}
          onCancel={close}
          onConfirm={() =>
            run(async () => {
              const password = await resetMemberPassword(call, member.humanId);
              setAction({ kind: 'revealed', password });
              onChanged();
            })
          }
        />
      ) : null}
      {action?.kind === 'revealed' ? (
        <FormDialog
          title={t('team.offboard.revealedTitle', { name: member.displayName })}
          description={t('team.members.createdHint')}
          labels={{ close: t('common.close'), cancel: t('common.close') }}
          submitLabel={t('team.done')}
          showCancel={false}
          onCancel={close}
          onSubmit={close}
        >
          <div {...stylex.props(styles.secret)} data-team-initial-password="">
            {action.password}
          </div>
          <Note tone="warning">{t('team.members.shownOnce')}</Note>
        </FormDialog>
      ) : null}
      {action?.kind === 'deactivate' || action?.kind === 'reactivate' ? (
        <ConfirmDialog
          title={t(
            action.kind === 'deactivate'
              ? 'team.offboard.deactivateTitle'
              : 'team.offboard.reactivateTitle',
            { name: member.displayName },
          )}
          description={t(
            action.kind === 'deactivate'
              ? 'team.offboard.deactivateBody'
              : 'team.offboard.reactivateBody',
          )}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t(
            action.kind === 'deactivate' ? 'team.offboard.deactivate' : 'team.offboard.reactivate',
          )}
          danger={action.kind === 'deactivate'}
          busy={busy}
          error={errorNote}
          onCancel={close}
          onConfirm={() =>
            run(async () => {
              if (action.kind === 'deactivate') await deactivateMember(call, member.humanId);
              else await reactivateMember(call, member.humanId);
              close();
              onChanged();
            })
          }
        />
      ) : null}
      {action?.kind === 'transfer' ? (
        <TransferDialog
          t={t}
          member={member}
          members={members}
          preview={action.preview}
          busy={busy}
          error={errorNote}
          onCancel={close}
          onTransfer={(toHumanId) =>
            run(async () => {
              await transferMember(call, member.humanId, toHumanId);
              close();
              onChanged();
            })
          }
        />
      ) : null}
      {action?.kind === 'purge' ? (
        <PurgeDialog
          t={t}
          member={member}
          preview={action.preview}
          busy={busy}
          error={errorNote}
          onCancel={close}
          onPurge={(username) =>
            run(async () => {
              await confirmPurge(call, {
                humanId: member.humanId,
                token: action.preview.token,
                username,
              });
              close();
              onChanged();
            })
          }
        />
      ) : null}
    </div>
  );
}

function TransferDialog({
  t,
  member,
  members,
  preview,
  busy,
  error,
  onCancel,
  onTransfer,
}: {
  t: BotHarnessTranslate;
  member: TeamMember;
  members: readonly TeamMember[];
  preview: TransferPreview;
  busy: boolean;
  error: ReactElement | undefined;
  onCancel(): void;
  onTransfer(toHumanId: string): void;
}): ReactElement {
  const targets = members.filter(
    (candidate) => candidate.humanId !== member.humanId && candidate.status === 'active',
  );
  const [target, setTarget] = useState(
    targets.find((row) => row.owner)?.humanId ?? targets[0]?.humanId ?? '',
  );
  const empty = preview.channels.length === 0 && preview.bots.length === 0;
  return (
    <FormDialog
      title={t('team.offboard.transferTitle', { name: member.displayName })}
      description={t(empty ? 'team.offboard.transferNothing' : 'team.offboard.transferBody')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.offboard.transfer')}
      submitDisabled={empty || target === ''}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={() => onTransfer(target)}
    >
      {empty ? null : (
        <>
          <ul {...stylex.props(styles.list)}>
            {preview.channels.map((channel) => (
              <li key={channel.channelId}>{`# ${channel.name}`}</li>
            ))}
            {preview.bots.map((bot) => (
              <li key={bot.slug}>{bot.displayName}</li>
            ))}
          </ul>
          <Select
            label={t('team.offboard.transferTo')}
            value={target}
            options={targets.map((row) => ({ value: row.humanId, label: row.displayName }))}
            onChange={setTarget}
            disabled={busy}
          />
        </>
      )}
    </FormDialog>
  );
}

function PurgeDialog({
  t,
  member,
  preview,
  busy,
  error,
  onCancel,
  onPurge,
}: {
  t: BotHarnessTranslate;
  member: TeamMember;
  preview: PurgePreview;
  busy: boolean;
  error: ReactElement | undefined;
  onCancel(): void;
  onPurge(username: string): void;
}): ReactElement {
  const [typed, setTyped] = useState('');
  return (
    <FormDialog
      title={t('team.offboard.purgeTitle', { name: member.displayName })}
      description={t('team.offboard.purgeBody', {
        channels: String(preview.counts.channels),
        bots: String(preview.counts.bots),
        messages: String(preview.counts.messages),
        files: String(preview.counts.files),
      })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.offboard.purgeConfirm')}
      danger
      submitDisabled={typed.trim() !== member.username}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={() => onPurge(typed.trim())}
    >
      <TextField
        label={t('team.offboard.purgeType', { username: member.username })}
        value={typed}
        onChange={setTyped}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        initialFocus
      />
    </FormDialog>
  );
}
