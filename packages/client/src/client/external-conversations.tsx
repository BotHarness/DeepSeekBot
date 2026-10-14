import { useState, type ReactElement, type ReactNode } from 'react';
import { Button, Checkbox, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { MessagingIdentityView } from '../../../core/src/messaging/identity.js';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type { BotHarnessTranslate } from './locale.js';
import { GroupReceptionSettings } from './messaging-grant.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { Combobox } from './combobox.js';

type Grant = MessagingSnapshot['grants'][number];
export type ConversationSync = (grant: Grant, channelId: string, enabled: boolean) => Promise<void>;
type Held = NonNullable<MessagingSnapshot['heldConversations']>[number];
type Blocked = NonNullable<MessagingSnapshot['blockedConversations']>[number];

const LIMITS = { 'hourly-limit': 20, 'active-limit': 500 } as const;

export function ExternalConversations({
  identity,
  snapshot,
  busy,
  t,
  change,
  rules,
  channels = [],
  sync,
  syncChannels = [],
}: {
  identity: MessagingIdentityView;
  snapshot: MessagingSnapshot | undefined;
  busy: boolean;
  t: BotHarnessTranslate;
  change(input: MessagingConversationInput): Promise<void>;
  rules(grantId: string, input: GroupReceptionInput): Promise<void>;
  channels?: { id: string; name: string }[];
  sync?: ConversationSync;
  syncChannels?: { id: string; name: string }[];
}): ReactElement {
  const [open, setOpen] = useState<string>();
  const [confirm, setConfirm] = useState<string>();
  const time = (value: string) => new Date(value).toLocaleString();
  const entries = (snapshot?.grants ?? []).filter(
    (g) => g.bindingId === identity.id && !g.revokedAt && g.receiveScope !== undefined,
  );
  const active = entries.filter((g) => !g.muted);
  const muted = entries.filter((g) => g.muted);
  const waiting = (snapshot?.heldConversations ?? []).filter((h) => h.bindingId === identity.id);
  const blocked = (snapshot?.blockedConversations ?? []).filter((b) => b.bindingId === identity.id);
  const gaps = (snapshot?.receptionHistory ?? []).filter(
    (interval) =>
      interval.providerId === identity.providerId && interval.fingerprint === identity.fingerprint,
  );
  const history = gaps.length ? (
    <details className="bh-im-field">
      <summary>{t('conversation.gapTitle', { count: gaps.length })}</summary>
      <p className="bh-muted">{t('conversation.gapHint')}</p>
      <ul>
        {gaps.map((interval) => (
          <li key={interval.id}>
            <strong>{t(`conversation.gap.${interval.reason}`)}</strong> · {interval.name}
            <p className="bh-muted">
              {t(`conversation.gapBoundary.${interval.boundary}`)} ·{' '}
              <time dateTime={interval.startedAt}>{time(interval.startedAt)}</time>
              {' — '}
              {interval.endedAt ? (
                <time dateTime={interval.endedAt}>{time(interval.endedAt)}</time>
              ) : (
                t('conversation.gapOngoing')
              )}
            </p>
          </li>
        ))}
      </ul>
    </details>
  ) : null;
  const kind = (value: 'dm' | 'group') =>
    t(value === 'dm' ? 'identity.kind.dm' : 'identity.kind.group');
  const icon = (value: 'dm' | 'group') => (value === 'dm' ? 'user' : 'users');
  const small = (
    label: string,
    hint: string,
    onClick: () => void,
    danger = false,
    pressed?: boolean,
  ) => (
    <Tooltip label={hint} portal side="top" maxWidth={280} delayMs={300}>
      <Button
        size="sm"
        variant="outline"
        className={danger ? 'bh-im-danger-outline' : undefined}
        aria-pressed={pressed}
        disabled={busy}
        onClick={onClick}
      >
        {label}
      </Button>
    </Tooltip>
  );
  const actions = (label: string, buttons: ReactNode, panel?: ReactNode): ReactNode => (
    <>
      <div className="bh-conversation-actions" role="group" aria-label={label}>
        {buttons}
      </div>
      {panel}
    </>
  );
  const confirmBlock = (key: string, name: string, block: () => void): ReactNode =>
    confirm === key ? (
      <div
        className="bh-conversation-confirm"
        role="alertdialog"
        aria-label={t('conversation.block')}
      >
        <p>{t('conversation.blockConfirm', { name })}</p>
        <div className="bh-modal-footer">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(undefined)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="bh-im-danger"
            disabled={busy}
            onClick={() => {
              setConfirm(undefined);
              block();
            }}
          >
            {t('conversation.confirmBlock')}
          </Button>
        </div>
      </div>
    ) : undefined;
  const synced = (grant: Grant) =>
    (grant.bridgeRoutes ?? [])
      .filter((route) => route.enabled !== false)
      .map((route) => channels.find((c) => c.id === route.channelId)?.name)
      .filter((name): name is string => name !== undefined);
  const entryRow = (grant: Grant) => {
    const scope = grant.receiveScope!;
    const name = grant.targetName || scope.conversationId;
    const panel =
      confirmBlock(
        grant.id,
        name,
        () => void change({ kind: 'block', grantId: grant.id, expectedRevision: grant.revision }),
      ) ??
      (open === `sync:${grant.id}` && sync ? (
        <ConversationChannelSync
          grant={grant}
          channels={syncChannels}
          busy={busy}
          sync={sync}
          t={t}
        />
      ) : open === grant.id && grant.groupPolicy ? (
        <>
          {identity.platform === 'feishu' ? (
            <div className="bh-im-field">
              <Checkbox
                label={t('conversation.openGroup')}
                checked={grant.openGroup === true}
                disabled={busy}
                onChange={(enabled) =>
                  void change({
                    kind: 'open-group',
                    grantId: grant.id,
                    expectedRevision: grant.preferenceRevision ?? 0,
                    open: enabled,
                  })
                }
              />
              <p className="bh-muted">{t('conversation.openGroupHint')}</p>
            </div>
          ) : null}
          <GroupReceptionSettings
            key={`${grant.id}:${grant.groupPolicy.revision}:${grant.groupPolicy.defaultRevision ?? 0}`}
            policy={grant.groupPolicy}
            verified={grant.ordinaryDelivery === 'verified'}
            busy={busy}
            t={t}
            save={(input) => rules(grant.id, input)}
          />
        </>
      ) : undefined);
    return (
      <SidebarCardRow
        key={grant.id}
        icon={icon(scope.kind)}
        title={name}
        meta={[
          kind(scope.kind),
          ...(grant.lastMessageAt
            ? [t('identity.lastMessage', { time: time(grant.lastMessageAt) })]
            : []),
          ...(synced(grant).length
            ? [t('conversation.syncedTo', { names: synced(grant).join('、') })]
            : []),
        ].join(' · ')}
        muted={grant.muted}
        detail={actions(
          name,
          <>
            {sync && scope.kind === 'group'
              ? small(
                  t('conversation.sync'),
                  t('conversation.syncHint'),
                  () => {
                    setConfirm(undefined);
                    setOpen(open === `sync:${grant.id}` ? undefined : `sync:${grant.id}`);
                  },
                  false,
                  open === `sync:${grant.id}`,
                )
              : null}
            {small(
              t(grant.muted ? 'conversation.unmute' : 'conversation.mute'),
              t(grant.muted ? 'conversation.unmuteHint' : 'conversation.muteHint'),
              () =>
                void change({
                  kind: 'mute',
                  grantId: grant.id,
                  expectedRevision: grant.preferenceRevision ?? 0,
                  muted: !grant.muted,
                }),
            )}
            {grant.groupPolicy
              ? small(
                  t('conversation.rules'),
                  t('conversation.rulesHint'),
                  () => {
                    setConfirm(undefined);
                    setOpen(open === grant.id ? undefined : grant.id);
                  },
                  false,
                  open === grant.id,
                )
              : null}
            {small(
              t('conversation.block'),
              t('conversation.blockHint'),
              () => setConfirm(grant.id),
              true,
            )}
          </>,
          panel,
        )}
      />
    );
  };
  const heldRow = (held: Held) => {
    const key = `held:${held.conversation.kind}:${held.conversation.id}`;
    const reason =
      held.reason === 'ask'
        ? t('conversation.reason.ask')
        : t(`conversation.reason.${held.reason}`, { count: LIMITS[held.reason] });
    return (
      <SidebarCardRow
        key={key}
        icon={icon(held.conversation.kind)}
        title={held.name}
        chips={<span className="bh-conversation-reason">{reason}</span>}
        meta={[
          kind(held.conversation.kind),
          t('conversation.seen', { count: held.count, time: time(held.lastSeenAt) }),
        ].join(' · ')}
        detail={actions(
          held.name,
          <>
            {small(
              t('conversation.allow'),
              t('conversation.allowHint'),
              () =>
                void change({
                  kind: 'allow',
                  bindingId: identity.id,
                  conversation: held.conversation,
                  from: 'held',
                  expectedRevision: held.revision,
                }),
            )}
            {small(
              t('conversation.block'),
              t('conversation.blockHint'),
              () => setConfirm(key),
              true,
            )}
          </>,
          confirmBlock(
            key,
            held.name,
            () =>
              void change({
                kind: 'block-held',
                bindingId: identity.id,
                conversation: held.conversation,
                expectedRevision: held.revision,
              }),
          ),
        )}
      />
    );
  };
  const blockedRow = (block: Blocked) => (
    <SidebarCardRow
      key={`blocked:${block.conversation.kind}:${block.conversation.id}`}
      icon={icon(block.conversation.kind)}
      title={block.name || block.conversation.id}
      meta={[
        kind(block.conversation.kind),
        t('conversation.blockedAt', { time: time(block.blockedAt) }),
      ].join(' · ')}
      muted
      detail={actions(
        block.name || block.conversation.id,
        small(
          t('conversation.allowAgain'),
          t('conversation.allowAgainHint'),
          () =>
            void change({
              kind: 'allow',
              bindingId: identity.id,
              conversation: block.conversation,
              from: 'blocked',
              expectedRevision: block.revision,
            }),
        ),
      )}
    />
  );
  const group = (label: string, rows: ReactElement[]) =>
    rows.length ? (
      <section className="bh-conversation-group" aria-label={label}>
        <span className="bh-conversation-group-title">
          {label} <small>{rows.length}</small>
        </span>
        <SidebarCardList label={label} className="bh-conversation-list">
          {rows}
        </SidebarCardList>
      </section>
    ) : null;
  if (!entries.length && !waiting.length && !blocked.length)
    return (
      <>
        <p className="bh-muted">
          {t(
            identity.platform === 'qq'
              ? 'identity.qqConversationsEmpty'
              : identity.platform === 'discord'
                ? 'identity.discordConversationsEmpty'
                : 'identity.conversationsEmpty',
          )}
        </p>
        {history}
      </>
    );
  return (
    <>
      {group(t('conversation.waiting'), waiting.map(heldRow))}
      {group(t('conversation.active'), active.map(entryRow))}
      {group(t('conversation.muted'), muted.map(entryRow))}
      {group(t('conversation.blocked'), blocked.map(blockedRow))}
      {history}
    </>
  );
}

function ConversationChannelSync({
  grant,
  channels,
  busy,
  sync,
  t,
}: {
  grant: Grant;
  channels: { id: string; name: string }[];
  busy: boolean;
  sync: ConversationSync;
  t: BotHarnessTranslate;
}): ReactElement {
  const [channelId, setChannelId] = useState('');
  const active = (grant.bridgeRoutes ?? []).filter(
    (route) => route.channelId !== null && route.enabled,
  );
  const inbox =
    grant.bridgeRoutes === undefined ||
    grant.bridgeRoutes.some((route) => route.channelId === null && route.enabled);
  const selected = channels.find((channel) => channel.id === channelId);
  return (
    <section className="bh-im-field" aria-label={t('conversation.syncTitle')}>
      <p className="bh-muted">{t('conversation.syncHint')}</p>
      <p role="status">
        {active.length === 0
          ? t(inbox ? 'bridge.inboxOnly' : 'im.reception.off')
          : t('conversation.syncedTo', {
              names: active
                .map(
                  (route) =>
                    channels.find((channel) => channel.id === route.channelId)?.name ??
                    t('im.targetUnavailable'),
                )
                .join('、'),
            })}
      </p>
      {active.map((route) => {
        const channel = channels.find((item) => item.id === route.channelId);
        return (
          <div key={route.id} className="bh-conversation-actions">
            <span>{channel?.name ?? t('im.targetUnavailable')}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || channel === undefined}
              aria-label={t('conversation.syncStopFor', {
                name: channel?.name ?? t('im.targetUnavailable'),
              })}
              onClick={() => void sync(grant, route.channelId!, false)}
            >
              {t('conversation.syncStop')}
            </Button>
          </div>
        );
      })}
      {channels.length ? (
        <>
          <Combobox
            label={t('conversation.syncTitle')}
            toggleLabel={t('conversation.syncTitle')}
            value={channelId}
            disabled={busy}
            options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
            onSelect={setChannelId}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={
              busy ||
              selected === undefined ||
              active.some((route) => route.channelId === channelId)
            }
            aria-label={t('conversation.syncApply', { name: selected?.name ?? '' })}
            onClick={() => void sync(grant, channelId, true)}
          >
            {t('conversation.sync')}
          </Button>
        </>
      ) : (
        <p className="bh-muted">{t('conversation.syncNone')}</p>
      )}
    </section>
  );
}
