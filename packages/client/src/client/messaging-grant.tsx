import { externalPlatformLabel } from './bridge-source-label.js';
import * as stylex from '@stylexjs/stylex';
import { DangerTextButton } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { space, text } from './ds/tokens.stylex.js';
import { MessagingHelp } from './messaging-help.js';
import type { OutboxIntent } from '../../../core/src/messaging/outbound.js';
import { ThreadReceptionSettings } from './thread-reception-settings.js';
import type {
  GroupReceptionInput,
  GroupReceptionPolicy,
} from '../../../core/src/messaging/group-policy.js';
import { useRef, useState, type ReactElement } from 'react';
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { OutboxState } from '../../../core/src/messaging/outbound.js';
import type { MessagingTarget } from '../../../core/src/messaging/provider.js';
import type { BridgeActions } from './actions.js';
import { Combobox } from './combobox.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMessagingSnapshot } from './messaging-store.js';
import { SidebarCardRow } from './sidebar-card.js';

const grantStyles = stylex.create({
  subject: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    margin: 0,
    fontWeight: text.strong,
    overflowWrap: 'anywhere',
  },
});

export function MessagingGrantRow({
  slug,
  actions,
  t,
}: {
  slug: string;
  actions: Pick<
    BridgeActions,
    | 'messagingGroupPolicy'
    | 'messagingThreadPolicy'
    | 'messagingReceive'
    | 'messagingChannelTarget'
    | 'messagingSnapshot'
    | 'messagingTargets'
    | 'messagingAuthorize'
    | 'messagingRevoke'
    | 'messagingSend'
  >;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<OutboxIntent>();
  const origin = report?.reply ?? report?.report;
  const { snapshot, failed: loadFailed, refresh, mount } = useMessagingSnapshot(slug, actions);
  const [accountKey, setAccountKey] = useState('');
  const [targets, setTargets] = useState<MessagingTarget[]>([]);
  const [targetRef, setTargetRef] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const request = useRef<{ id: string; grantId: string; text: string }>();
  const account = snapshot?.accounts.find(
    (item) => `${item.providerId}:${item.ref}` === accountKey,
  );
  const grant = snapshot?.grants.find(
    (item) => item.revokedAt === undefined && item.origin !== 'implicit',
  );
  const operate = async (operation: () => Promise<void>) => {
    if (busy) return;
    const version = generation.current;
    setBusy(true);
    setFailed(false);
    try {
      await operation();
      await refresh();
    } catch {
      if (version === generation.current) setFailed(true);
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  const chooseAccount = async (key: string) => {
    setAccountKey(key);
    setTargetRef('');
    setTargets([]);
    const selected = snapshot?.accounts.find((item) => `${item.providerId}:${item.ref}` === key);
    if (!selected) return;
    const version = ++generation.current;
    await operate(async () => {
      const values = await actions.messagingTargets(selected.providerId, selected.ref);
      if (version === generation.current) setTargets(values);
    });
  };
  const authorize = () =>
    operate(async () => {
      const target = targets.find((item) => item.ref === targetRef);
      if (!account || !target) return;
      await actions.messagingAuthorize({
        botSlug: slug,
        providerId: account.providerId,
        accountRef: account.ref,
        fingerprint: account.fingerprint,
        targetRef: target.ref,
        targetDigest: target.digest,
      });
    });
  const send = () =>
    operate(async () => {
      if (!grant || !text.trim()) return;
      if (
        !request.current ||
        request.current.grantId !== grant.id ||
        request.current.text !== text
      ) {
        request.current = { id: crypto.randomUUID(), grantId: grant.id, text };
      }
      await actions.messagingSend(slug, grant.id, request.current.id, text);
      setText('');
      request.current = undefined;
    });
  const stateLabel = (state: OutboxState) => {
    switch (state) {
      case 'provider-accepted':
        return t('im.accepted');
      case 'unknown-outcome':
        return t('im.unknown');
      case 'pending':
      case 'in-flight':
        return t('im.sending');
      case 'grant-revoked':
        return t('im.revoked');
      case 'cancelled':
        return t('im.cancelled');
      case 'failed':
        return t('im.failed');
    }
  };
  const platformName = grant ? externalPlatformLabel(grant.platform, t) : '';
  const availability = grant
    ? grant.availability === 'available'
      ? t('im.bound')
      : grant.availability === 'rebind-required'
        ? t('im.rebind')
        : t('im.unavailable')
    : undefined;
  return (
    <>
      <SidebarCardRow
        anchor="lark-grant"
        icon="messages-square"
        title={grant ? grant.targetName : t('im.authorizeRow')}
        meta={
          snapshot === undefined
            ? loadFailed
              ? t('im.error')
              : t('im.loading')
            : grant
              ? `${platformName} · ${grant.accountName}`
              : t('im.authorizeRowHint')
        }
        chips={availability === undefined ? undefined : <Tag tone="neutral">{availability}</Tag>}
        muted={!grant}
        hint={t('im.title')}
        dialog
        onClick={() => {
          setReport(undefined);
          setOpen(true);
        }}
        trailing={<span ref={mount} hidden />}
      />
      {open ? (
        <PanelDialog
          size={report ? 'medium' : 'small'}
          onClose={() => {
            if (report !== undefined) setReport(undefined);
            else setOpen(false);
          }}
          title={report ? t('im.reportTitle') : t('im.title')}
          {...(report ? {} : { description: t('im.summary') })}
          closeLabel={t('common.close')}
          {...(report ? {} : { data: { 'data-im-grant': '' } })}
          {...(report || !grant
            ? {}
            : {
                secondary: (
                  <DangerTextButton
                    disabled={busy}
                    onClick={() =>
                      void operate(async () => {
                        await actions.messagingRevoke(slug, grant.id);
                      })
                    }
                  >
                    {t('im.revoke')}
                  </DangerTextButton>
                ),
              })}
          actions={
            report ? (
              <Button variant="outline" onClick={() => setReport(undefined)}>
                {t('im.back')}
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void operate(async () => undefined)}
              >
                {t('im.refresh')}
              </Button>
            )
          }
        >
          {report ? null : (
            <>
              {failed ? <Note tone="danger">{t('im.error')}</Note> : null}
              {grant ? (
                <p {...stylex.props(grantStyles.subject)}>
                  {platformName} · {grant.targetName} · {grant.accountName}
                  {availability === undefined ? null : <Tag tone="neutral">{availability}</Tag>}
                </p>
              ) : null}
              {snapshot === undefined ? (
                <p>{t('im.loading')}</p>
              ) : grant ? (
                <>
                  {grant.channelBridge || grant.bridgeRoutes ? (
                    <p>{t('bridge.managed')}</p>
                  ) : grant.canReceive === true || grant.receiveScope !== undefined ? (
                    <>
                      <div className="bh-im-field">
                        <span className="bh-im-heading">
                          <span>{t('im.localTarget')}</span>
                          <MessagingHelp
                            title={t('im.localTarget')}
                            text={
                              grant.receiveTargetChannelId
                                ? t('im.channelTargetHint')
                                : t(
                                    grant.platform === 'weixin'
                                      ? 'im.receiveHintDM'
                                      : 'im.receiveHint',
                                  )
                            }
                            t={t}
                          />
                        </span>
                        <Combobox
                          label={t('im.localTarget')}
                          toggleLabel={t('im.localTarget')}
                          value={grant.receiveTargetChannelId ?? ''}
                          fallbackValue=""
                          disabled={busy || grant.platform === 'weixin'}
                          onSelect={(value) => {
                            const channelId = value || null;
                            void operate(() =>
                              actions.messagingChannelTarget(slug, grant.id, channelId),
                            );
                          }}
                          options={[
                            { value: '', label: t('im.inboxTarget') },
                            ...(grant.receiveTargetChannelId &&
                            !snapshot.channelTargets?.some(
                              (target) => target.id === grant.receiveTargetChannelId,
                            )
                              ? [
                                  {
                                    value: grant.receiveTargetChannelId,
                                    label: t('im.targetUnavailable'),
                                  },
                                ]
                              : []),
                            ...(snapshot.channelTargets ?? []).map((target) => ({
                              value: target.id,
                              label: target.name,
                            })),
                          ]}
                        />
                      </div>
                      <p className="bh-im-status" role="status">
                        {grant.platform === 'weixin'
                          ? t(
                              grant.reception === 'receiving'
                                ? 'im.receptionDM'
                                : 'im.receptionDMOff',
                            )
                          : t(`im.reception.${grant.reception ?? 'off'}`)}
                      </p>
                      {grant.receiveScope && grant.groupPolicy ? (
                        <GroupReceptionSettings
                          key={`${grant.id}:${grant.groupPolicy.revision}:${grant.groupPolicy.defaultRevision ?? 0}`}
                          policy={grant.groupPolicy}
                          verified={grant.ordinaryDelivery === 'verified'}
                          busy={busy}
                          t={t}
                          save={(input) =>
                            operate(() => actions.messagingGroupPolicy(slug, grant.id, input))
                          }
                        />
                      ) : null}
                      <Button
                        size="sm"
                        variant="primary"
                        className={grant.receiveScope === undefined ? undefined : 'bh-im-danger'}
                        disabled={
                          busy ||
                          (grant.receiveScope === undefined && grant.availability !== 'available')
                        }
                        onClick={() =>
                          void operate(async () => {
                            await actions.messagingReceive(
                              slug,
                              grant.id,
                              grant.receiveScope === undefined,
                            );
                          })
                        }
                      >
                        {t(
                          grant.receiveScope === undefined
                            ? grant.platform === 'weixin'
                              ? 'im.receiveEnableDM'
                              : 'im.receiveEnable'
                            : grant.platform === 'weixin'
                              ? 'im.receiveDisableDM'
                              : 'im.receiveDisable',
                        )}
                      </Button>
                    </>
                  ) : null}
                  {grant.threadPolicies?.length ? (
                    <ThreadReceptionSettings
                      policies={grant.threadPolicies}
                      busy={busy}
                      t={t}
                      save={async (sourceEventId, input) => {
                        let saved = false;
                        await operate(async () => {
                          await actions.messagingThreadPolicy(slug, sourceEventId, input);
                          saved = true;
                        });
                        return saved;
                      }}
                    />
                  ) : null}
                  {grant.platform === 'weixin' && !grant.canPost ? (
                    <p>{t('im.weixinReplyOnly')}</p>
                  ) : (
                    <>
                      {grant.platform === 'weixin' ? <p>{t('im.weixinProactive')}</p> : null}
                      <label className="bh-im-field">
                        <span>{t('im.message')}</span>
                        <textarea
                          aria-label={t('im.message')}
                          value={text}
                          maxLength={4000}
                          disabled={busy}
                          onChange={(event) => setText(event.target.value)}
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="primary"
                        className="bh-im-submit"
                        disabled={busy || !text.trim() || grant.availability !== 'available'}
                        onClick={() => void send()}
                      >
                        {t('im.send')}
                      </Button>
                    </>
                  )}
                </>
              ) : snapshot.accounts.length === 0 ? (
                <p>{t('im.setup')}</p>
              ) : (
                <>
                  <label className="bh-im-field">
                    <span>{t('im.account')}</span>
                    <Combobox
                      label={t('im.account')}
                      toggleLabel={t('im.account')}
                      placeholder={t('im.select')}
                      value={accountKey}
                      disabled={busy}
                      onSelect={(value) => void chooseAccount(value)}
                      options={snapshot.accounts
                        .filter(
                          (item) =>
                            snapshot.identities === undefined ||
                            snapshot.identities.some(
                              (i) =>
                                i.providerId === item.providerId &&
                                i.accountRef === item.ref &&
                                i.enabled,
                            ),
                        )
                        .map((item) => ({
                          value: `${item.providerId}:${item.ref}`,
                          label: item.name,
                          hint: externalPlatformLabel(item.platform, t),
                          disabled: !item.connected,
                        }))}
                    />
                  </label>
                  <div className="bh-im-field">
                    <span className="bh-im-heading">
                      <span>{t('im.target')}</span>
                      <MessagingHelp title={t('im.target')} text={t('im.grant')} t={t} />
                    </span>
                    <Combobox
                      label={t('im.target')}
                      toggleLabel={t('im.target')}
                      placeholder={t('im.select')}
                      value={targetRef}
                      disabled={busy || !account}
                      onSelect={setTargetRef}
                      options={targets.map((item) => ({ value: item.ref, label: item.name }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    className="bh-im-submit"
                    disabled={busy || !account || !targetRef}
                    onClick={() => void authorize()}
                  >
                    {t('im.authorize')}
                  </Button>
                </>
              )}
              {snapshot?.intents.length ? (
                <section className="bh-im-history" aria-label={t('im.history')}>
                  <strong>{t('im.history')}</strong>
                  {snapshot.intents.slice(0, 5).map((intent) => (
                    <div key={intent.id} className="bh-im-outcome">
                      <Tag tone="neutral">{stateLabel(intent.state)}</Tag>
                      {intent.report || intent.reply ? (
                        <Button
                          type="button"
                          variant="outline"
                          aria-label={t(intent.reply ? 'im.inspectReply' : 'im.inspectReport', {
                            name: (intent.reply ?? intent.report)!.targetName,
                          })}
                          onClick={() => setReport(intent)}
                        >
                          {intent.text.slice(0, 100)}
                          {intent.text.length > 100 ? '…' : ''}
                        </Button>
                      ) : (
                        <span>{intent.text}</span>
                      )}
                      {intent.state === 'unknown-outcome' ? <p>{t('im.noRetry')}</p> : null}
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          )}
          {report ? (
            <div className="bh-external-source-content">
              <header className="bh-external-route">
                <div className="bh-external-route-head">
                  <span className="bh-external-platform">
                    {origin ? externalPlatformLabel(origin.platform, t) : ''}
                  </span>
                  <Tag tone="neutral">{stateLabel(report.state)}</Tag>
                </div>
                <strong>{origin?.targetName}</strong>
                <span>{t('im.sentAs', { name: origin?.accountName ?? report.botSlug })}</span>
                <p className="bh-external-context-hint">{t('im.externalOnly')}</p>
              </header>
              <article className="bh-external-message">
                <span className="bh-external-avatar" aria-hidden="true">
                  ↗
                </span>
                <div className="bh-external-message-main">
                  <header className="bh-external-message-head">
                    <strong>{origin?.accountName}</strong>
                    <time dateTime={report.createdAt}>
                      {new Date(report.createdAt).toLocaleString()}
                    </time>
                  </header>
                  <div className="bh-external-message-text">{report.text}</div>
                </div>
              </article>
              {report.state === 'unknown-outcome' ? (
                <p className="bh-external-notice">{t('im.noRetry')}</p>
              ) : null}
              {report.reason === 'private-context-unavailable' ||
              report.reason === 'private-context-rejected' ? (
                <p className="bh-external-context-hint">{t('im.weixinContextRequired')}</p>
              ) : null}
              {report.echo ? <p>{t('im.echoConfirmed')}</p> : null}
              <details className="bh-external-details">
                <summary>{t('im.originDetails')}</summary>
                <div className="bh-external-detail-body">
                  <p>
                    {t('im.outboxId')}: {report.id}
                  </p>
                  <p>
                    {t('im.externalMessageId')}:{' '}
                    {report.receipt?.identityKind === 'client-acknowledgement'
                      ? (report.receipt.serverMessageId ?? t('im.notAvailable'))
                      : (report.receipt?.messageId ?? t('im.notAvailable'))}
                  </p>
                  {report.receipt?.identityKind === 'client-acknowledgement' ? (
                    <p>
                      {t('im.clientAcknowledgement')}: {report.receipt.messageId}
                    </p>
                  ) : null}
                  <p>
                    {t('im.conversationId')}: {origin?.conversationId}
                  </p>
                  {report.sourceEventId ? (
                    <p>
                      {t('im.sourceEventId')}: {report.sourceEventId}
                    </p>
                  ) : null}
                  {report.reply?.route.threadId ? (
                    <p>
                      {t('im.threadId')}: {report.reply.route.threadId}
                    </p>
                  ) : null}
                  {report.reason ? <p>{report.reason}</p> : null}
                </div>
              </details>
            </div>
          ) : null}
        </PanelDialog>
      ) : null}
    </>
  );
}

export function GroupReceptionSettings({
  policy,
  verified,
  busy,
  t,
  save,
}: {
  policy: GroupReceptionPolicy;
  verified: boolean;
  busy: boolean;
  t: BotHarnessTranslate;
  save(input: GroupReceptionInput): Promise<void>;
}): ReactElement {
  const [collection, setCollection] = useState(policy.collection);
  const [inheritance, setInheritance] = useState(policy.inheritance ?? 'custom');
  const [wake, setWake] = useState(policy.wake);
  const [count, setCount] = useState(String(policy.count));
  const [seconds, setSeconds] = useState(String(policy.intervalSeconds));
  const numericCount = Number(count),
    numericSeconds = Number(seconds);
  const valid =
    Number.isInteger(numericCount) &&
    numericCount >= 1 &&
    numericCount <= 100 &&
    Number.isInteger(numericSeconds) &&
    numericSeconds >= 1 &&
    numericSeconds <= 86400;
  const changed =
    inheritance !== (policy.inheritance ?? 'custom') ||
    collection !== policy.collection ||
    wake !== policy.wake ||
    numericCount !== policy.count ||
    numericSeconds !== policy.intervalSeconds;
  return (
    <section className="bh-im-group-policy" aria-label={t('im.groupPolicy')}>
      <div className="bh-im-heading bh-im-wide">
        <strong>{t('im.groupPolicy')}</strong>
        <MessagingHelp title={t('im.groupPolicy')} text={t('im.wakeHint')} t={t} />
      </div>
      <div className="bh-im-field">
        <span className="bh-im-heading">
          <span>{t('defaults.origin')}</span>
          <MessagingHelp title={t('defaults.origin')} text={t('defaults.restoreHint')} t={t} />
          {policy.defaultRevision !== undefined ? <small>v{policy.defaultRevision}</small> : null}
        </span>
        <Combobox
          searchable={false}
          label={t('defaults.origin')}
          toggleLabel={t('defaults.origin')}
          value={inheritance}
          disabled={busy}
          onSelect={(value) => setInheritance(value === 'inherit' ? 'inherit' : 'custom')}
          options={[
            { value: 'inherit', label: t('defaults.inherited') },
            { value: 'custom', label: t('defaults.custom') },
          ]}
        />
      </div>
      <div className="bh-im-field">
        <span className="bh-im-heading">
          <span>{t('im.collection')}</span>
          <MessagingHelp
            title={t('im.collection')}
            text={t(verified ? 'im.ordinaryVerified' : 'im.ordinaryUnverified')}
            t={t}
          />
        </span>
        <Combobox
          searchable={false}
          label={t('im.collection')}
          toggleLabel={t('im.collection')}
          value={collection}
          disabled={busy || inheritance === 'inherit'}
          onSelect={(value) => setCollection(value === 'all' ? 'all' : 'mentions')}
          options={[
            { value: 'mentions', label: t('im.collection.mentions') },
            { value: 'all', label: t('im.collection.all'), disabled: !verified },
          ]}
        />
      </div>
      {!verified ? <p className="bh-im-notice bh-im-wide">{t('im.ordinaryUnverified')}</p> : null}
      <div className="bh-im-field bh-im-wide">
        <span className="bh-im-heading">
          <span>{t('im.ordinaryWake')}</span>
          <MessagingHelp title={t('im.ordinaryWake')} text={t('im.wakeHint')} t={t} />
        </span>
        <Combobox
          searchable={false}
          label={t('im.ordinaryWake')}
          toggleLabel={t('im.ordinaryWake')}
          value={wake}
          disabled={busy || inheritance === 'inherit' || collection !== 'all'}
          onSelect={(value) => setWake(value as GroupReceptionInput['wake'])}
          options={(['digest', 'immediate', 'mentions', 'silent'] as const).map((mode) => ({
            value: mode,
            label: t(`im.wake.${mode}`),
          }))}
        />
      </div>
      {wake === 'digest' ? (
        <div className="bh-im-digest-fields bh-im-wide">
          <label className="bh-im-field">
            <span>{t('im.digestCount')}</span>
            <Input
              aria-label={t('im.digestCount')}
              type="number"
              min={1}
              max={100}
              value={count}
              disabled={busy || inheritance === 'inherit' || collection !== 'all'}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <label className="bh-im-field">
            <span>{t('im.digestSeconds')}</span>
            <Input
              aria-label={t('im.digestSeconds')}
              type="number"
              min={1}
              max={86400}
              value={seconds}
              disabled={busy || inheritance === 'inherit' || collection !== 'all'}
              onChange={(event) => setSeconds(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <div className="bh-im-policy-footer bh-im-wide">
        <small className="bh-im-policy-revision">
          {t('im.policyRevision', {
            revision: String(policy.revision),
            editor: t(
              policy.editor.kind === 'bot'
                ? 'im.policyBot'
                : policy.editor.kind === 'human'
                  ? 'im.policyHuman'
                  : 'im.policyDefault',
            ),
          })}
        </small>
        <Button
          size="sm"
          variant="primary"
          disabled={
            busy ||
            !valid ||
            !changed ||
            (inheritance !== 'inherit' && collection === 'all' && !verified)
          }
          onClick={() =>
            void save({
              collection,
              wake,
              count: numericCount,
              intervalSeconds: numericSeconds,
              inheritance,
              expectedRevision: policy.revision,
              ...(policy.defaultRevision !== undefined
                ? { expectedDefaultRevision: policy.defaultRevision }
                : {}),
            })
          }
        >
          {t('im.policySave')}
        </Button>
      </div>
    </section>
  );
}
