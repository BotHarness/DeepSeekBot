import { createHash, randomUUID } from 'node:crypto';
import { dmChannelId } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type {
  ChannelToolApproval,
  ToolApprovalActor,
  ToolApprovalNotice,
} from '../workspaces/tool-approval.js';
import type { BotPairing, PairingRequest } from './pairing.js';
import { assertMessagingIdentity, type MessagingIdentity } from './identity.js';
import {
  MessagingError,
  MessagingProviderError,
  type MessagingProvider,
  type MessagingReceipt,
  type MessagingApprovalAction,
  type MessagingApprovalAck,
  type MessagingApprovalCard,
} from './provider.js';

export interface ApprovalRoute {
  botSlug: string;
  pairingId: string;
  pairingRevision: number;
  bindingId: string;
  revision: number;
}
export interface ApprovalDelivery {
  id: string;
  botSlug: string;
  requestMessageId?: string;
  sessionId?: string;
  callId?: string;
  operationHash?: string;
  route: ApprovalRoute;
  createdAt: string;
  expiresAt?: string;
  delivery: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown-outcome';
  attempts: number;
  receipt?: MessagingReceipt;
  reason?: string;
  status: MessagingApprovalCard['status'];
  update: 'none' | 'sending' | 'updated' | 'failed' | 'unknown-outcome';
  resultSeq?: number;
  actor?: ToolApprovalActor;
}
export interface ApprovalMessagingSnapshot {
  route?: ApprovalRoute;
  routeRevision: number;
  destinations: {
    pairingId: string;
    name: string;
    reference: string;
    accountName: string;
    ready: boolean;
  }[];
  deliveries: ApprovalDelivery[];
}
export interface ApprovalMessaging {
  attach(owner: ChannelToolApproval, channels: ChannelStore): () => void;
  snapshot(botSlug: string): ApprovalMessagingSnapshot;
  setRoute(botSlug: string, pairingId: string | undefined, expectedRevision: number): Promise<void>;
  test(botSlug: string): Promise<ApprovalDelivery>;
  retry(botSlug: string, id: string): Promise<ApprovalDelivery>;
  action(
    providerId: string,
    event: MessagingApprovalAction,
    signal: AbortSignal,
  ): Promise<MessagingApprovalAck>;
  result(sessionId: string, event: { type: string; seq?: number; data: unknown }): void;
  close(): void;
}

const operationHash = (notice: ToolApprovalNotice) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        notice.botSlug,
        notice.sessionId,
        notice.callId,
        notice.toolName,
        notice.role,
        notice.cwd,
        notice.input,
      ]),
    )
    .digest('hex');
const MAX_ATTEMPTS = 3;

export function createApprovalMessaging(options: {
  database: OperationalDatabaseModulePort;
  pairing: BotPairing;
  provider(id: string): MessagingProvider;
  isBotActive(slug: string): boolean;
  recover?: boolean;
  warn?(message: string): void;
}): ApprovalMessaging {
  const { database, pairing } = options;
  let owner: ChannelToolApproval | undefined;
  let channels: ChannelStore | undefined;
  let closed = false;
  let detach: (() => void) | undefined;
  const controller = new AbortController();
  const busy = new Set<string>();
  const resultText = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const write = (value: ApprovalDelivery) => {
    if (closed) return;
    database.transaction(
      (db) => {
        db.prepare(
          'INSERT INTO messaging_approval_deliveries(id, bot_slug, body) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body',
        ).run(value.id, value.botSlug, JSON.stringify(value));
      },
      ['approval-messaging'],
    );
  };
  const read = (id: string): ApprovalDelivery | undefined =>
    closed
      ? undefined
      : database.read((db) => {
          const row = db
            .prepare('SELECT body FROM messaging_approval_deliveries WHERE id = ?')
            .get(id) as { body: string } | undefined;
          return row ? (JSON.parse(row.body) as ApprovalDelivery) : undefined;
        });
  const route = (slug: string): ApprovalRoute | undefined =>
    database.read((db) => {
      const row = db
        .prepare('SELECT body FROM messaging_approval_routes WHERE bot_slug = ?')
        .get(slug) as { body: string } | undefined;
      return row?.body ? (JSON.parse(row.body) as ApprovalRoute) : undefined;
    });
  const routeRevision = (slug: string): number =>
    database.read(
      (db) =>
        (
          db
            .prepare('SELECT revision FROM messaging_approval_routes WHERE bot_slug = ?')
            .get(slug) as { revision: number } | undefined
        )?.revision ?? 0,
    );
  const resolve = (
    value: ApprovalRoute,
  ): { identity: MessagingIdentity; paired: PairingRequest; provider: MessagingProvider } => {
    if (closed || !options.isBotActive(value.botSlug)) throw new MessagingError('bot-unavailable');
    const identity = database.read((db) => assertMessagingIdentity(db, value.bindingId));
    if (identity.botSlug !== value.botSlug || identity.platform !== 'feishu')
      throw new MessagingError('approval-route-unavailable');
    const paired = pairing.list(value.botSlug).find((p) => p.id === value.pairingId);
    if (
      !paired ||
      paired.bindingId !== identity.id ||
      paired.revision !== value.pairingRevision ||
      paired.status !== 'approved' ||
      (paired.purpose === 'conversation' && paired.conversationKind !== 'dm') ||
      !paired.capabilities.some((c) => c === 'approve' || c === 'reject')
    )
      throw new MessagingError('approval-route-unavailable');
    const provider = options.provider(identity.providerId);
    if (!provider.approvalCard) throw new MessagingError('capability-unavailable');
    return { identity, paired, provider };
  };
  const canonical = (value: ApprovalDelivery): ToolApprovalNotice | undefined => {
    if (!value.requestMessageId || !value.sessionId || !value.callId || !value.expiresAt) return;
    const request = channels?.message(
      dmChannelId(value.botSlug),
      value.requestMessageId,
    )?.toolApprovalRequest;
    if (!request) return;
    const notice = {
      ...request,
      botSlug: value.botSlug,
      messageId: value.requestMessageId,
      expiresAt: value.expiresAt,
    };
    return notice.sessionId === value.sessionId &&
      notice.callId === value.callId &&
      operationHash(notice) === value.operationHash
      ? notice
      : undefined;
  };
  const requestLive = (value: ApprovalDelivery) => {
    if (!value.requestMessageId) return value.status === 'test';
    const pending = owner?.pending(value.botSlug, value.requestMessageId);
    return pending !== undefined && operationHash(pending) === value.operationHash;
  };
  const render = (value: ApprovalDelivery): MessagingApprovalCard => {
    const notice = canonical(value);
    const labels: Record<MessagingApprovalCard['status'], string> = {
      'web-required':
        'Native session authorization; review in Web / 此请求授予原生会话权限，请在 Web 审核',
      pending: 'Awaiting an authorized decision / 等待授权用户处理',
      'allowed-once': 'Decision accepted; execution not yet confirmed / 已批准一次，执行结果待确认',
      rejected: 'Rejected; approval does not permit execution / 已拒绝，不允许执行',
      expired:
        'Expired or owner unavailable; use a new request / 已过期或执行者不可用，请使用新请求',
      executed: 'Native execution result recorded / 已记录原生执行结果',
      'execution-failed': 'Native execution failed / 原生执行失败',
      'execution-unknown': 'Execution not confirmed; inspect Web / 执行结果未确认，请查看 Web',
      test: 'Management route test; no operation or approval / 管理通知测试，不包含操作或授权',
    };
    const fullDetail = [
      labels[value.status],
      ...(resultText.has(value.id) ? [resultText.get(value.id)!] : []),
      ...(notice ? [notice.toolName, notice.role, notice.cwd, notice.input] : []),
    ].join('\n');
    const detail =
      fullDetail.length <= 16000
        ? fullDetail
        : fullDetail.slice(0, 15880) +
          '\nContent truncated; inspect the complete operation in Web before deciding / 内容已截断，决定前请在 Web 查看完整操作';
    return {
      requestId: value.id,
      title: notice ? 'Tool approval / 工具审批' : 'Management notification / 管理通知',
      detail,
      status: value.status,
    };
  };
  const safe = (value: ApprovalDelivery): boolean => {
    try {
      const selected = route(value.botSlug);
      if (
        !selected ||
        selected.revision !== value.route.revision ||
        selected.pairingId !== value.route.pairingId
      )
        return false;
      resolve(value.route);
      return true;
    } catch {
      return false;
    }
  };
  const bounded = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    return Promise.race([
      run(signal),
      new Promise<never>((_, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new MessagingProviderError('provider-result-unknown', 'unknown')),
          { once: true },
        ),
      ),
    ]);
  };
  const trace = (
    initiator: string,
    phase: string,
    outcome: string,
    durationMs: number,
    reason = 'none',
    attempt = 0,
  ) =>
    options.warn?.(
      `approval-notification ${JSON.stringify({ initiator, phase, outcome, durationMs: Math.round(durationMs), reason, attempt })}`,
    );
  const update = async (id: string): Promise<void> => {
    if (busy.has(id) || closed) return;
    const startedAt = performance.now();
    const value = read(id);
    if (!value?.receipt || !safe(value)) return;
    busy.add(id);
    let updateReason = 'none';
    try {
      const currentStatus = value.status;
      const context = resolve(value.route);
      write({ ...value, update: 'sending' });
      await bounded((signal) =>
        context.provider.approvalCard!({
          accountRef: context.identity.accountRef,
          fingerprint: context.identity.fingerprint,
          route: value.receipt!,
          card: render(value),
          signal,
          update: true,
          beforeSend: () => safe(value) && read(id)?.status === currentStatus,
        }),
      );
      const latest = read(id);
      if (latest) write({ ...latest, update: 'updated' });
      trace('native-settlement', 'update', 'updated', performance.now() - startedAt);
    } catch (error) {
      updateReason =
        (error instanceof MessagingError || error instanceof MessagingProviderError) &&
        /^[a-z0-9-]{1,80}$/.test(error.code)
          ? error.code
          : 'provider-update-failed';
      const latest = read(id);
      if (latest)
        write({
          ...latest,
          update:
            error instanceof MessagingProviderError && error.disposition === 'not-started'
              ? 'failed'
              : 'unknown-outcome',
        });
    } finally {
      trace(
        'native-settlement',
        'update-finish',
        read(id)?.update ?? 'disposed',
        performance.now() - startedAt,
        updateReason,
      );
      busy.delete(id);
      const latest = read(id);
      if (latest && latest.status !== value.status) void update(id);
    }
  };
  const send = async (id: string): Promise<ApprovalDelivery> => {
    const startedAt = performance.now();
    const value = read(id);
    if (!value) throw new MessagingError('approval-delivery-unavailable');
    if (
      busy.has(id) ||
      !['pending', 'failed'].includes(value.delivery) ||
      value.attempts >= MAX_ATTEMPTS
    )
      return value;
    busy.add(id);
    write({ ...value, attempts: value.attempts + 1 });
    let started = false;
    try {
      const context = resolve(value.route);
      if (!safe(value) || !requestLive(value))
        throw new MessagingProviderError('request-expired', 'not-started');
      const messageId = context.paired.messageIds?.[0];
      if (!messageId) throw new MessagingProviderError('source-unavailable', 'not-started');
      write({ ...value, delivery: 'sending', attempts: value.attempts + 1 });
      started = true;
      const result = await bounded((signal) =>
        context.provider.approvalCard!({
          accountRef: context.identity.accountRef,
          fingerprint: context.identity.fingerprint,
          route: {
            messageId,
            conversationId: context.paired.conversationId,
            actorId: context.paired.actorId,
          },
          card: render(value),
          signal,
          beforeSend: () => safe(value) && requestLive(value),
        }),
      );
      if (!result.receipt) throw new MessagingProviderError('provider-result-unknown', 'unknown');
      const latest = read(id);
      if (!latest) return value;
      write({ ...latest, delivery: 'sent', receipt: result.receipt });
    } catch (error) {
      const latest = read(id)!;
      const definite =
        !started ||
        (error instanceof MessagingProviderError && error.disposition === 'not-started');
      write({
        ...latest,
        delivery: definite ? 'failed' : 'unknown-outcome',
        reason:
          error instanceof MessagingError || error instanceof MessagingProviderError
            ? error.code
            : 'provider-result-unknown',
      });
      if (
        definite &&
        started &&
        safe(value) &&
        requestLive(value) &&
        latest.attempts < MAX_ATTEMPTS
      ) {
        const timer = setTimeout(() => {
          timers.delete(id);
          void send(id).catch(() => options.warn?.('approval-notification-retry-failed'));
        }, latest.attempts * 1000);
        timer.unref();
        timers.set(id, timer);
        trace(
          'native-approval',
          'retry-scheduled',
          'waiting',
          performance.now() - startedAt,
          latest.reason ?? 'known-unsent',
          latest.attempts,
        );
      }
    } finally {
      const result = read(id);
      trace(
        value.status === 'test' ? 'authenticated-web' : 'native-approval',
        'send-finish',
        result?.delivery ?? 'disposed',
        performance.now() - startedAt,
        result?.reason ?? 'none',
        result?.attempts ?? 0,
      );
      busy.delete(id);
    }
    const latest = read(id) ?? value;
    if (latest.receipt && latest.status !== value.status) void update(id);
    return latest;
  };
  const notify = (notice: ToolApprovalNotice, status: 'pending' | string) => {
    if (closed) return;
    if (status === 'pending') {
      if (read(notice.messageId)) return;
      const selected = route(notice.botSlug);
      if (!selected) return;
      write({
        id: notice.messageId,
        botSlug: notice.botSlug,
        requestMessageId: notice.messageId,
        sessionId: notice.sessionId,
        callId: notice.callId,
        operationHash: operationHash(notice),
        route: selected,
        createdAt: new Date().toISOString(),
        expiresAt: notice.expiresAt,
        delivery: 'pending',
        attempts: 0,
        status: notice.externalDecision === 'web-only' ? 'web-required' : 'pending',
        update: 'none',
      });
      queueMicrotask(
        () =>
          void send(notice.messageId).catch(() =>
            options.warn?.('approval-notification-send-failed'),
          ),
      );
    } else {
      const value = read(notice.messageId);
      if (!value) return;
      write({
        ...value,
        status:
          status === 'allowed-once'
            ? 'allowed-once'
            : status === 'rejected'
              ? 'rejected'
              : 'expired',
      });
      queueMicrotask(() => void update(value.id));
    }
  };
  if (options.recover !== false)
    database.transaction((db) => {
      db.prepare(
        "UPDATE messaging_approval_deliveries SET body = json_set(body, '$.delivery', CASE WHEN json_extract(body, '$.delivery') = 'sending' THEN 'unknown-outcome' ELSE json_extract(body, '$.delivery') END, '$.status', CASE WHEN json_extract(body, '$.status') IN ('pending', 'web-required') THEN 'expired' WHEN json_extract(body, '$.status') = 'allowed-once' THEN 'execution-unknown' ELSE json_extract(body, '$.status') END, '$.update', CASE WHEN json_extract(body, '$.update') = 'sending' THEN 'unknown-outcome' ELSE json_extract(body, '$.update') END)",
      ).run();
    });
  const service: ApprovalMessaging = {
    attach(nextOwner, nextChannels) {
      detach?.();
      owner = nextOwner;
      channels = nextChannels;
      const unsubscribe = nextOwner.subscribe(notify);
      detach = unsubscribe;
      return () => {
        unsubscribe();
        if (detach === unsubscribe) {
          owner = undefined;
          channels = undefined;
          detach = undefined;
        }
      };
    },
    snapshot(botSlug) {
      const selected = route(botSlug);
      const destinations = pairing
        .list(botSlug)
        .filter(
          (p) =>
            p.status === 'approved' &&
            p.capabilities.some((c) => c === 'approve' || c === 'reject'),
        )
        .map((p) => {
          let ready = false;
          try {
            resolve({
              botSlug,
              pairingId: p.id,
              pairingRevision: p.revision,
              bindingId: p.bindingId,
              revision: selected?.revision ?? 0,
            });
            ready = true;
          } catch {}
          return {
            pairingId: p.id,
            name: p.actorName ?? 'Name unavailable / 名称不可用',
            reference: p.reference,
            accountName: p.accountName,
            ready,
          };
        });
      const deliveries = database.read((db) =>
        (
          db
            .prepare(
              'SELECT body FROM messaging_approval_deliveries WHERE bot_slug = ? ORDER BY rowid DESC LIMIT 20',
            )
            .all(botSlug) as { body: string }[]
        ).map((row) => JSON.parse(row.body) as ApprovalDelivery),
      );
      return {
        ...(selected ? { route: selected } : {}),
        routeRevision: routeRevision(botSlug),
        destinations,
        deliveries,
      };
    },
    async setRoute(botSlug, pairingId, expectedRevision) {
      if (routeRevision(botSlug) !== expectedRevision)
        throw new MessagingError('approval-route-stale');
      if (pairingId === undefined) {
        database.transaction(
          (db) =>
            db
              .prepare(
                'INSERT INTO messaging_approval_routes(bot_slug, revision, body) VALUES(?, ?, NULL) ON CONFLICT(bot_slug) DO UPDATE SET revision = excluded.revision, body = NULL',
              )
              .run(botSlug, expectedRevision + 1),
          ['approval-messaging'],
        );
        return;
      }
      const paired = pairing.list(botSlug).find((p) => p.id === pairingId);
      if (!paired) throw new MessagingError('approval-route-unavailable');
      const selected = {
        botSlug,
        pairingId,
        pairingRevision: paired.revision,
        bindingId: paired.bindingId,
        revision: expectedRevision + 1,
      };
      const context = resolve(selected);
      const account = await context.provider.inspectAccount?.(context.identity.accountRef);
      if (!account?.connected || account.fingerprint !== context.identity.fingerprint)
        throw new MessagingError('provider-unavailable');
      if (routeRevision(botSlug) !== expectedRevision)
        throw new MessagingError('approval-route-stale');
      resolve(selected);
      database.transaction(
        (db) =>
          db
            .prepare(
              'INSERT INTO messaging_approval_routes(bot_slug, revision, body) VALUES(?, ?, ?) ON CONFLICT(bot_slug) DO UPDATE SET revision = excluded.revision, body = excluded.body',
            )
            .run(botSlug, selected.revision, JSON.stringify(selected)),
        ['approval-messaging'],
      );
    },
    async test(botSlug) {
      const selected = route(botSlug);
      if (!selected) throw new MessagingError('approval-route-unavailable');
      resolve(selected);
      const value: ApprovalDelivery = {
        id: randomUUID(),
        botSlug,
        route: selected,
        createdAt: new Date().toISOString(),
        delivery: 'pending',
        attempts: 0,
        status: 'test',
        update: 'none',
      };
      write(value);
      return send(value.id);
    },
    async retry(botSlug, id) {
      const value = read(id);
      if (
        !value ||
        value.botSlug !== botSlug ||
        value.delivery !== 'failed' ||
        value.attempts >= MAX_ATTEMPTS
      )
        throw new MessagingError('approval-retry-unavailable');
      return send(id);
    },
    async action(providerId, event, signal) {
      const value = read(event.requestId);
      const authorized = () => {
        try {
          if (
            !value ||
            signal.aborted ||
            value.status !== 'pending' ||
            !safe(value) ||
            !requestLive(value)
          )
            return false;
          const context = resolve(value.route);
          const paired = pairing.assert(
            value.botSlug,
            context.identity.id,
            event.actorId,
            event.action === 'allowed-once' ? 'approve' : 'reject',
            value.route.pairingId,
          );
          return (
            context.identity.providerId === providerId &&
            context.identity.accountRef === event.botId &&
            context.identity.fingerprint === event.fingerprint &&
            paired.id === value.route.pairingId &&
            paired.revision === value.route.pairingRevision &&
            paired.conversationId === event.conversationId &&
            value.delivery === 'sent' &&
            value.receipt?.conversationId === event.conversationId &&
            value.receipt.messageId === event.messageId
          );
        } catch {
          return false;
        }
      };
      if (!value || !authorized()) return { accepted: true, status: 'refused' };
      const context = resolve(value.route);
      const actor: ToolApprovalActor = {
        platform: 'feishu',
        bindingId: context.identity.id,
        fingerprint: event.fingerprint,
        actorId: event.actorId,
        pairingId: value.route.pairingId,
        pairingRevision: value.route.pairingRevision,
        conversationId: event.conversationId,
        messageId: event.messageId,
      };
      queueMicrotask(
        () =>
          void owner
            ?.decide(value.botSlug, value.requestMessageId!, event.action, {
              actor,
              authorized: () => {
                try {
                  if (signal.aborted || !safe(value)) return false;
                  const paired = pairing.assert(
                    value.botSlug,
                    context.identity.id,
                    event.actorId,
                    event.action === 'allowed-once' ? 'approve' : 'reject',
                    value.route.pairingId,
                  );
                  return paired.id === actor.pairingId && paired.revision === actor.pairingRevision;
                } catch {
                  return false;
                }
              },
            })
            .then((accepted) => {
              if (accepted) {
                const latest = read(value.id);
                if (latest) write({ ...latest, actor });
              }
            })
            .catch(() => options.warn?.('approval-decision-result-unknown')),
      );
      return { accepted: true, status: 'queued' };
    },
    result(sessionId, event) {
      if (closed) return;
      if (
        event.type !== 'tool/result' ||
        !Number.isSafeInteger(event.seq) ||
        !event.data ||
        typeof event.data !== 'object'
      )
        return;
      const data = event.data as Record<string, unknown>;
      const message = data['message'];
      if (
        !message ||
        typeof message !== 'object' ||
        !('toolCallId' in message) ||
        typeof message.toolCallId !== 'string'
      )
        return;
      const callId = message.toolCallId;
      const resultSeq = event.seq!;
      const rows = database.read((db) =>
        (
          db
            .prepare(
              "SELECT body FROM messaging_approval_deliveries WHERE json_extract(body, '$.sessionId') = ? AND json_extract(body, '$.callId') = ? AND json_extract(body, '$.status') = 'allowed-once'",
            )
            .all(sessionId, callId) as { body: string }[]
        ).map((row) => JSON.parse(row.body) as ApprovalDelivery),
      );
      for (const value of rows) {
        const isError = 'isError' in message && message.isError === true;
        resultText.set(value.id, JSON.stringify(message).slice(0, 2000));
        if (resultText.size > 100) resultText.delete(resultText.keys().next().value!);
        write({ ...value, status: isError ? 'execution-failed' : 'executed', resultSeq });
        queueMicrotask(() => void update(value.id));
      }
    },
    close() {
      trace('host-disposal', 'release', 'closed', 0, 'cancelled', timers.size);
      closed = true;
      detach?.();
      controller.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
  return service;
}
