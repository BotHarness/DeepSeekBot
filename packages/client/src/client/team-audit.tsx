import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { TeamMember } from './team-bridge.js';
import { teamErrorText } from './team-settings.js';
import {
  auditActionKey,
  loadAuditLog,
  loadPrivateObjects,
  loadPrivatePage,
  openPrivateContent,
  PRIVATE_PAGE_SIZE,
  verifyAudit,
  type AuditRecord,
  type PrivateMessage,
  type PrivateObject,
  type PrivateView,
} from './team-audit-bridge.js';

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  message: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderRadius: radius.md,
    backgroundColor: color.well,
    minWidth: 0,
  },
  meta: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  body: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  group: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  title: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
});

function time(at: string): string {
  const date = new Date(at);
  const language = typeof document === 'undefined' ? undefined : document.documentElement.lang;
  return Number.isNaN(date.getTime())
    ? at
    : date.toLocaleString(language || undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AuditLogSection({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [rows, setRows] = useState<readonly AuditRecord[]>();
  const [next, setNext] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [verified, setVerified] = useState<'intact' | 'broken' | 'failed'>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    loadAuditLog(call, undefined, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows(page.records);
        setNext(page.next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [call]);
  return (
    <SettingsSection title={t('team.audit.title')}>
      <div ref={mount}>
        <SettingsRow
          title={t('team.audit.integrity')}
          description={t(
            verified === undefined
              ? 'team.audit.integrityHint'
              : verified === 'failed'
                ? 'team.audit.verifyFailed'
                : `team.audit.${verified}`,
          )}
          data={{ 'data-team-row': 'audit-verify' }}
          control={
            <Button
              variant="outline"
              onClick={() =>
                void verifyAudit(call).then(
                  (ok) => setVerified(ok ? 'intact' : 'broken'),
                  () => setVerified('failed'),
                )
              }
            >
              {t('team.audit.verify')}
            </Button>
          }
        />
        {failed ? <Note tone="danger">{t('team.audit.loadFailed')}</Note> : null}
        {rows !== undefined && rows.length === 0 ? <Note>{t('team.audit.empty')}</Note> : null}
        <div role="list" aria-label={t('team.audit.title')}>
          {(rows ?? []).map((row) => {
            const label =
              row.action === undefined
                ? t('team.audit.entry', {
                    viewer: row.viewerName,
                    object: row.objectName,
                    kind: t(`team.audit.kind.${row.kind}`),
                  })
                : t(`team.audit.action.${auditActionKey(row.action)}`, {
                    viewer: row.viewerName,
                    object: row.objectName,
                  });
            return (
              <div role="listitem" key={row.auditId} data-audit-record={row.auditId}>
                <SettingsRow
                  title={label}
                  description={
                    row.reason === undefined
                      ? time(row.at)
                      : t('team.audit.entryReason', { at: time(row.at), reason: row.reason })
                  }
                />
              </div>
            );
          })}
        </div>
        {next === undefined ? null : (
          <div>
            <Button
              variant="outline"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                setFailed(false);
                loadAuditLog(call, next)
                  .then((page) => {
                    setRows((current) => [...(current ?? []), ...page.records]);
                    setNext(page.next);
                  })
                  .catch(() => setFailed(true))
                  .finally(() => setLoadingMore(false));
              }}
            >
              {t('team.audit.more')}
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

export function PrivateContentSection({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection title={t('team.private.title')}>
      <SettingsRow
        title={t('team.private.open')}
        description={t('team.private.listBody')}
        data={{ 'data-team-row': 'private-content' }}
        control={
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t('team.private.view')}
          </Button>
        }
      />
      {open ? <PrivateContentDialog call={call} t={t} onClose={() => setOpen(false)} /> : null}
    </SettingsSection>
  );
}

export function PrivateContentEntry({
  call,
  t,
  member,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  member: TeamMember;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div {...stylex.props(styles.group)} data-private-entry={member.username}>
      <p {...stylex.props(styles.title)}>{t('team.private.title')}</p>
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t('team.private.open')}
        </Button>
      </div>
      {open ? (
        <PrivateContentDialog call={call} t={t} member={member} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

type Step =
  | { kind: 'list' }
  | { kind: 'confirm'; object: PrivateObject }
  | {
      kind: 'view';
      object: PrivateObject;
      view: PrivateView;
      messages: readonly PrivateMessage[];
      more: boolean;
    };

function PrivateContentDialog({
  call,
  t,
  member,
  onClose,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  member?: TeamMember;
  onClose(): void;
}): ReactElement {
  const humanId = member?.humanId;
  const [objects, setObjects] = useState<readonly PrivateObject[]>();
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    loadPrivateObjects(call, humanId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setObjects(next);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(teamErrorText(t, failure));
      });
    return () => controller.abort();
  }, [call, humanId]);
  const owners = (object: PrivateObject): string =>
    member?.displayName ?? object.ownerNames.join(', ');
  const errorNote = error === undefined ? undefined : <Note tone="danger">{error}</Note>;
  if (step.kind === 'confirm')
    return (
      <FormDialog
        title={t('team.private.confirmTitle', { name: step.object.name })}
        description={t('team.private.confirmBody', { name: owners(step.object) })}
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        submitLabel={t('team.private.view')}
        busy={busy}
        error={errorNote}
        onCancel={() => setStep({ kind: 'list' })}
        onClose={onClose}
        onSubmit={() => {
          setBusy(true);
          setError(undefined);
          openPrivateContent(call, step.object, reason)
            .then((view) =>
              setStep({
                kind: 'view',
                object: step.object,
                view,
                messages: view.messages,
                more: view.messages.length >= PRIVATE_PAGE_SIZE,
              }),
            )
            .catch((failure: unknown) => setError(teamErrorText(t, failure)))
            .finally(() => setBusy(false));
        }}
      >
        <TextField
          label={t('team.private.reason')}
          value={reason}
          onChange={setReason}
          maxLength={200}
          initialFocus
        />
      </FormDialog>
    );
  if (step.kind === 'view')
    return (
      <FormDialog
        title={step.object.name}
        size="medium"
        scroll
        labels={{ close: t('common.close'), cancel: t('common.close') }}
        submitLabel={t('team.done')}
        showCancel={false}
        onCancel={onClose}
        onClose={onClose}
        onSubmit={onClose}
      >
        <Note tone="warning">{t('team.private.recorded')}</Note>
        {errorNote}
        {step.more ? (
          <div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const oldest = step.messages.at(-1);
                if (oldest === undefined) return;
                setBusy(true);
                setError(undefined);
                loadPrivatePage(call, step.view.viewId, oldest.id)
                  .then((older) =>
                    setStep({
                      ...step,
                      messages: [...step.messages, ...older],
                      more: older.length >= PRIVATE_PAGE_SIZE,
                    }),
                  )
                  .catch((failure: unknown) => setError(teamErrorText(t, failure)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('team.private.earlier')}
            </Button>
          </div>
        ) : null}
        {step.messages.length === 0 ? (
          <Note>{t('team.private.noMessages')}</Note>
        ) : (
          <ul {...stylex.props(styles.list)} data-private-view={step.view.viewId}>
            {[...step.messages].reverse().map((message) => (
              <li key={message.id} {...stylex.props(styles.message)}>
                <span
                  {...stylex.props(styles.meta)}
                >{`${message.author} · ${time(message.at)}`}</span>
                <span {...stylex.props(styles.body)}>{message.body}</span>
              </li>
            ))}
          </ul>
        )}
      </FormDialog>
    );
  return (
    <FormDialog
      title={
        member === undefined
          ? t('team.private.title')
          : t('team.private.listTitle', { name: member.displayName })
      }
      description={t('team.private.listBody')}
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel=""
      showCancel={false}
      error={errorNote}
      onCancel={onClose}
      onClose={onClose}
    >
      <div ref={mount}>
        {objects === undefined && error === undefined ? (
          <Note>{t('team.private.loading')}</Note>
        ) : null}
        {objects !== undefined && objects.length === 0 ? (
          <Note>{t('team.private.none')}</Note>
        ) : null}
        <div role="list">
          {(objects ?? []).map((object) => (
            <div
              role="listitem"
              key={`${object.kind}:${object.objectId}`}
              data-private-object={object.objectId}
            >
              <SettingsRow
                title={object.name}
                description={
                  member === undefined && object.ownerNames.length > 0
                    ? t('team.private.kindOwners', {
                        kind: t(`team.private.kind.${object.kind}`),
                        owners: object.ownerNames.join(', '),
                      })
                    : t(`team.private.kind.${object.kind}`)
                }
                control={
                  <Button
                    variant="outline"
                    aria-label={t('team.private.viewNamed', { name: object.name })}
                    onClick={() => {
                      setReason('');
                      setStep({ kind: 'confirm', object });
                    }}
                  >
                    {t('team.private.view')}
                  </Button>
                }
              />
            </div>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}
