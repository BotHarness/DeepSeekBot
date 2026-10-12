import { randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { BotPairing, PairingRequest } from './pairing.js';
import { assertMessagingIdentity } from './identity.js';
import { readBlock } from './conversations.js';
import { effectivePairingPermissions } from './permission-groups.js';
import { externalUserRoles, type ExternalUserRole } from './sender-access.js';
import {
  MessagingError,
  type MessagingProvider,
  type MessagingPairingCard,
  type MessagingPairingAction,
  type MessagingReplyRoute,
  type MessagingReceipt,
  type MessagingApprovalAck,
} from './provider.js';

interface Delivery {
  id: string;
  requestId: string;
  requestRevision: number;
  botSlug: string;
  bindingId: string;
  route: MessagingReplyRoute;
  recipientId?: string;
  receipt?: MessagingReceipt;
  delivery: 'sending' | 'accepted' | 'unknown';
  update: 'needed' | 'sending' | 'accepted' | 'unknown';
  status: MessagingPairingCard['status'];
  roles: { id: string; name: string; revision: number }[];
  selected?: { id: string; revision: number; actorId: string };
  page: number;
  revision: number;
}

export function createPairingCards(options: {
  database: OperationalDatabaseModulePort;
  recover?: boolean;
  pairing: BotPairing;
  provider(id: string): { provider: MessagingProvider; assertCurrent(): void };
  isBotActive(slug: string): boolean;
  notifyApplicant(request: PairingRequest): Promise<void>;
  routeAvailable(request: PairingRequest): boolean;
  warn?(message: string): void;
}) {
  const { database, pairing } = options;
  const lifetime = new AbortController();
  const running = new Set<string>();
  let closed = options.recover === false;
  const read = (id: string): Delivery | undefined =>
    database.read((db) => {
      const row = db.prepare('SELECT body FROM messaging_pairing_cards WHERE id = ?').get(id) as
        | { body: string }
        | undefined;
      return row ? (JSON.parse(row.body) as Delivery) : undefined;
    });
  const write = (value: Delivery) =>
    database.transaction(
      (db) => {
        db.prepare('UPDATE messaging_pairing_cards SET body = ? WHERE id = ?').run(
          JSON.stringify(value),
          value.id,
        );
      },
      ['pairing'],
    );
  const request = (value: Delivery) =>
    pairing.list(value.botSlug).find((p) => p.id === value.requestId);
  const identity = (value: Delivery) => {
    if (closed || !options.isBotActive(value.botSlug)) throw new MessagingError('bot-unavailable');
    return database.read((db) => {
      const binding = assertMessagingIdentity(db, value.bindingId);
      if (
        binding.botSlug !== value.botSlug ||
        binding.platform !== 'feishu' ||
        readBlock(db, value.botSlug, binding.fingerprint, {
          kind: value.recipientId ? 'dm' : 'group',
          id: value.route.conversationId,
        })
      )
        throw new MessagingError('pairing-card-unavailable');
      return binding;
    });
  };
  const reviewer = (value: Delivery, actorId: string) => {
    identity(value);
    if (value.recipientId && value.recipientId !== actorId)
      throw new MessagingError('pairing-unauthorized');
    return database.read((db) => {
      const permissions = effectivePairingPermissions(db, value.botSlug, value.bindingId, actorId);
      if (!permissions.capabilities.includes('review-pairing'))
        throw new MessagingError('pairing-unauthorized');
      return permissions;
    });
  };
  const permitted = (value: Delivery, actorId: string, role: ExternalUserRole) => {
    const permissions = reviewer(value, actorId);
    return [...role.capabilities, ...(role.delegableCapabilities ?? [])].every((cap) =>
      (permissions.delegableCapabilities ?? []).includes(cap),
    );
  };
  const render = (value: Delivery): MessagingPairingCard => {
    const applicant = request(value);
    const selected = value.roles.find((role) => role.id === value.selected?.id);
    const currentRole = value.selected
      ? database.read((db) =>
          externalUserRoles(db, value.botSlug).find((role) => role.id === value.selected!.id),
        )
      : undefined;
    const pages = Math.max(1, Math.ceil(value.roles.length / 20));
    return {
      kind: 'pairing',
      requestId: value.id,
      title: 'Pairing review / 配对审核',
      detail: [
        `Applicant / 申请人: ${applicant?.actorName ?? applicant?.actorId ?? 'Unavailable / 不可用'}`,
        `Request / 申请: ${applicant?.reference ?? '—'}`,
        `Conversation / 会话: ${applicant?.conversationId ?? '—'}`,
        `Expires / 到期: ${applicant?.expiresAt ?? '—'}`,
        `Status / 状态: ${value.status}`,
        ...(selected ? [`Role / 角色: ${selected.name} · r${value.selected!.revision}`] : []),
        ...(currentRole && currentRole.revision === value.selected?.revision
          ? [
              `Management / 管理能力: ${currentRole.capabilities.join(', ') || 'None / 无'}`,
              `Delegation / 可委派: ${currentRole.delegableCapabilities?.join(', ') || 'None / 无'}`,
            ]
          : selected
            ? [
                'The selected Role changed; review the request in Web settings. / 已选角色发生变化，请在 Web 设置中重新审核。',
              ]
            : []),
        ...(value.status === 'pending'
          ? [
              'Only authorized pairing reviewers may decide. Select a Role before approval. / 仅有配对审核权限者可操作；批准前请选择角色。',
            ]
          : [
              'This request is settled; send a fresh question after approval. / 该申请已结束；批准后请重新发送新问题。',
            ]),
      ]
        .join('\n')
        .slice(0, 16000),
      status: value.status,
      roles: value.roles.slice(value.page * 20, (value.page + 1) * 20),
      ...(value.selected ? { selectedRoleId: value.selected.id } : {}),
      page: value.page,
      pages,
    };
  };
  const log = (phase: string, outcome: string) =>
    options.warn?.(
      JSON.stringify({ event: 'pairing-card', initiator: 'messaging', phase, outcome }),
    );
  const refresh = (botSlug?: string) => {
    if (closed) return;
    const values = database.read((db) =>
      (
        db
          .prepare(
            'SELECT body FROM messaging_pairing_cards WHERE (? IS NULL OR bot_slug = ?) ORDER BY rowid',
          )
          .all(botSlug ?? null, botSlug ?? null) as { body: string }[]
      ).map((row) => JSON.parse(row.body) as Delivery),
    );
    for (const stored of values) {
      const applicant = request(stored);
      const status: Delivery['status'] =
        applicant?.status === 'pending' ||
        applicant?.status === 'approved' ||
        applicant?.status === 'rejected'
          ? applicant.status
          : applicant?.status === 'expired'
            ? 'expired'
            : 'unavailable';
      let value = stored;
      if (status !== stored.status) {
        value = { ...stored, status, update: 'needed', revision: stored.revision + 1 };
        write(value);
      }
      if (value.receipt && value.update === 'needed') void update(value.id);
    }
  };
  const update = async (id: string) => {
    if (closed || running.has(id)) return;
    const value = read(id);
    if (!value?.receipt || value.update !== 'needed') return;
    running.add(id);
    try {
      const binding = identity(value);
      const entry = options.provider(binding.providerId);
      if (!entry.provider.approvalCard) return;
      write({ ...value, update: 'sending' });
      await entry.provider.approvalCard({
        accountRef: binding.accountRef,
        fingerprint: binding.fingerprint,
        route: value.receipt,
        card: render(value),
        update: true,
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
        beforeSend() {
          try {
            entry.assertCurrent();
            identity(value);
            return read(id)?.revision === value.revision;
          } catch {
            return false;
          }
        },
      });
      if (!closed && read(id)?.revision === value.revision) write({ ...value, update: 'accepted' });
      log('update', 'accepted');
    } catch {
      if (!closed && read(id)?.revision === value.revision) write({ ...value, update: 'unknown' });
      log('update', 'unconfirmed');
    } finally {
      running.delete(id);
      if (!closed && read(id)?.update === 'needed') void update(id);
    }
  };
  const send = async (value: Delivery) => {
    try {
      const binding = identity(value);
      const entry = options.provider(binding.providerId);
      if (!entry.provider.approvalCard) throw new MessagingError('capability-unavailable');
      const result = await entry.provider.approvalCard({
        accountRef: binding.accountRef,
        fingerprint: binding.fingerprint,
        route: value.route,
        card: render(value),
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
        beforeSend() {
          try {
            entry.assertCurrent();
            identity(value);
            const applicant = request(value);
            if (value.recipientId) reviewer(value, value.recipientId);
            return (
              applicant?.status === 'pending' &&
              applicant.revision === value.requestRevision &&
              options.routeAvailable(applicant)
            );
          } catch {
            return false;
          }
        },
      });
      if (
        result.sent !== true ||
        !result.receipt?.messageId ||
        result.receipt.conversationId !== value.route.conversationId
      )
        throw new MessagingError('provider-result-unknown');
      if (!closed)
        write({
          ...read(value.id)!,
          delivery: 'accepted',
          receipt: result.receipt,
          update: 'needed',
        });
      log('send', 'accepted');
      refresh(value.botSlug);
    } catch {
      if (!closed) write({ ...read(value.id)!, delivery: 'unknown' });
      log('send', 'unconfirmed');
    }
  };
  const notify = (applicant: PairingRequest) => {
    if (
      closed ||
      applicant.status !== 'pending' ||
      applicant.purpose !== 'conversation' ||
      !applicant.reply
    )
      return;
    const reviewers = pairing
      .list(applicant.botSlug)
      .filter(
        (p) =>
          p.status === 'approved' &&
          p.bindingId === applicant.bindingId &&
          p.capabilities.includes('review-pairing'),
      );
    const recipients = new Map(reviewers.map((p) => [p.actorId, p]));
    const routes: { route: MessagingReplyRoute; recipientId?: string }[] = [];
    if (applicant.conversationKind === 'group') routes.push({ route: applicant.reply });
    for (const p of recipients.values()) {
      const route = p.privateReply ?? (p.conversationKind !== 'group' ? p.reply : undefined);
      if (route) routes.push({ route, recipientId: p.actorId });
    }
    for (const destination of routes) {
      const id = randomUUID();
      const value: Delivery = {
        id,
        requestId: applicant.id,
        requestRevision: applicant.revision,
        botSlug: applicant.botSlug,
        bindingId: applicant.bindingId,
        ...destination,
        delivery: 'sending',
        update: 'accepted',
        status: 'pending',
        roles: [],
        page: 0,
        revision: 1,
      };
      const roles = database.read((db) => externalUserRoles(db, applicant.botSlug));
      value.roles = roles
        .filter((role) =>
          [...recipients.keys()].some((actor) => {
            try {
              return (
                (!value.recipientId || value.recipientId === actor) && permitted(value, actor, role)
              );
            } catch {
              return false;
            }
          }),
        )
        .map((role) => ({ id: role.id, name: role.name, revision: role.revision }));
      const inserted = database.transaction(
        (db) => {
          db.prepare(
            "DELETE FROM messaging_pairing_cards WHERE id IN (SELECT id FROM messaging_pairing_cards WHERE bot_slug = ? AND json_extract(body, '$.status') <> 'pending' ORDER BY rowid DESC LIMIT -1 OFFSET 100)",
          ).run(applicant.botSlug);
          if (
            (db.prepare('SELECT count(*) AS n FROM messaging_pairing_cards').get() as { n: number })
              .n >= 2500
          )
            return false;
          return (
            db
              .prepare(
                'INSERT OR IGNORE INTO messaging_pairing_cards(id, request_id, bot_slug, destination, body) VALUES(?, ?, ?, ?, ?)',
              )
              .run(
                id,
                applicant.id,
                applicant.botSlug,
                value.recipientId
                  ? `dm:${value.recipientId}`
                  : `group:${value.route.conversationId}`,
                JSON.stringify(value),
              ).changes === 1
          );
        },
        ['pairing'],
      );
      if (inserted) void send(value);
    }
  };
  const action = async (
    providerId: string,
    event: MessagingPairingAction,
    signal: AbortSignal,
  ): Promise<MessagingApprovalAck> => {
    try {
      signal.throwIfAborted();
      const value = read(event.requestId);
      if (
        !value ||
        value.delivery !== 'accepted' ||
        value.status !== 'pending' ||
        !value.receipt ||
        value.receipt.messageId !== event.messageId ||
        value.receipt.conversationId !== event.conversationId
      )
        throw new MessagingError('pairing-card-stale');
      const binding = identity(value);
      if (
        providerId !== binding.providerId ||
        event.botId !== binding.accountRef ||
        event.fingerprint !== binding.fingerprint
      )
        throw new MessagingError('pairing-unauthorized');
      const applicant = request(value);
      if (
        applicant?.status !== 'pending' ||
        applicant.revision !== value.requestRevision ||
        !options.routeAvailable(applicant)
      )
        throw new MessagingError('pairing-stale');
      reviewer(value, event.actorId);
      if (event.action === 'approve-pairing' || event.action === 'reject-pairing') {
        if (
          event.action === 'approve-pairing' &&
          (!value.selected ||
            value.selected.actorId !== event.actorId ||
            value.selected.id !== event.roleId)
        )
          throw new MessagingError('pairing-card-stale');
        signal.throwIfAborted();
        const accepted = pairing.review(
          value.botSlug,
          event.action === 'reject-pairing'
            ? { kind: 'reject', id: value.requestId, expectedRevision: value.requestRevision }
            : {
                kind: 'approve',
                id: value.requestId,
                expectedRevision: value.requestRevision,
                roleId: value.selected!.id,
                expectedRoleRevision: value.selected!.revision,
              },
          { bindingId: value.bindingId, actorId: event.actorId },
        );
        refresh(value.botSlug);
        void options.notifyApplicant(accepted).catch(() => log('applicant-notice', 'unconfirmed'));
      } else {
        let next: Delivery = { ...value, revision: value.revision + 1, update: 'needed' };
        if (event.action === 'select-role') {
          const snapshot = value.roles.find((role) => role.id === event.roleId);
          const role = database.read((db) =>
            externalUserRoles(db, value.botSlug).find((role) => role.id === event.roleId),
          );
          if (
            !snapshot ||
            !role ||
            role.revision !== snapshot.revision ||
            !permitted(value, event.actorId, role)
          )
            throw new MessagingError('pairing-delegation-denied');
          next = {
            ...next,
            selected: { id: role.id, revision: role.revision, actorId: event.actorId },
          };
        } else {
          const page = value.page + (event.action === 'next-roles' ? 1 : -1);
          if (page < 0 || page >= Math.max(1, Math.ceil(value.roles.length / 20)))
            throw new MessagingError('pairing-card-stale');
          next = { ...next, page };
        }
        write(next);
        void update(value.id);
      }
      return { accepted: true, status: 'queued' };
    } catch {
      log('action', 'refused');
      return { accepted: true, status: 'refused' };
    }
  };
  if (!closed)
    database.transaction((db) =>
      db
        .prepare(
          "UPDATE messaging_pairing_cards SET body = json_set(body, '$.delivery', CASE WHEN json_extract(body, '$.delivery') = 'sending' THEN 'unknown' ELSE json_extract(body, '$.delivery') END, '$.update', CASE WHEN json_extract(body, '$.update') = 'sending' THEN 'needed' ELSE json_extract(body, '$.update') END)",
        )
        .run(),
    );
  const timer = setInterval(() => {
    try {
      refresh();
    } catch {
      log('reconcile', 'unconfirmed');
    }
  }, 1000);
  timer.unref();
  return {
    notify,
    action,
    refresh,
    close() {
      closed = true;
      lifetime.abort();
      clearInterval(timer);
    },
  };
}
