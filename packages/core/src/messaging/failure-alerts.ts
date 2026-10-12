import { createHash, randomUUID } from 'node:crypto';
import type { ChannelMessageCommit } from '../channels/store.js';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { ApprovalMessaging, ApprovalRoute } from './approval-messaging.js';
import { readBlock } from './conversations.js';
import { boundedMessagingDelivery } from './bounded-delivery.js';
import { MessagingError, MessagingProviderError, type MessagingReceipt } from './provider.js';

export interface FailureAlertSettings {
  enabled: boolean;
  revision: number;
}
export interface FailureAlertDelivery {
  id: string;
  botSlug: string;
  channelId?: string;
  messageId?: string;
  sessionId?: string;
  role?: 'orchestrator' | 'assignment';
  route?: ApprovalRoute;
  settingsRevision: number;
  createdAt: string;
  state: 'pending' | 'sending' | 'provider-accepted' | 'failed' | 'unknown-outcome' | 'cancelled';
  attempts: number;
  receipt?: MessagingReceipt;
  reason?: string;
}
export interface FailureAlertSnapshot extends FailureAlertSettings {
  available: boolean;
  deliveries: FailureAlertDelivery[];
}
export interface FailureAlerts {
  snapshot(botSlug: string): FailureAlertSnapshot;
  set(botSlug: string, enabled: boolean, expectedRevision: number): void;
  test(botSlug: string): Promise<FailureAlertDelivery>;
  retry(botSlug: string, id: string): Promise<FailureAlertDelivery>;
  committed(commit: ChannelMessageCommit): void;
  close(): void;
}

export function createFailureAlerts(options: {
  database: OperationalDatabaseModulePort;
  approvals: ApprovalMessaging;
  isBotActive(slug: string): boolean;
  ownsFailure(slug: string, sessionId: string, role: 'orchestrator' | 'assignment'): boolean;
  recover?: boolean;
  now?: () => Date;
  warn?(message: string): void;
}): FailureAlerts {
  const { database, approvals } = options;
  const lifetime = new AbortController();
  const busy = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const now = () => (options.now?.() ?? new Date()).toISOString();
  let closed = false;
  const settings = (slug: string): FailureAlertSettings =>
    database.read((db) => {
      const row = db
        .prepare(
          'SELECT enabled, revision FROM messaging_failure_alert_settings WHERE bot_slug = ?',
        )
        .get(slug) as { enabled: number; revision: number } | undefined;
      return { enabled: row?.enabled === 1, revision: row?.revision ?? 0 };
    });
  const read = (id: string): FailureAlertDelivery =>
    database.read((db) => {
      const row = db
        .prepare('SELECT body FROM messaging_failure_alert_deliveries WHERE id = ?')
        .get(id) as { body: string } | undefined;
      if (!row) throw new MessagingError('failure-alert-unavailable');
      return JSON.parse(row.body) as FailureAlertDelivery;
    });
  const write = (value: FailureAlertDelivery) => {
    if (closed) return;
    database.transaction(
      (db) =>
        db
          .prepare('UPDATE messaging_failure_alert_deliveries SET body = ? WHERE id = ?')
          .run(JSON.stringify(value), value.id),
      ['failure-alerts'],
    );
  };
  const destination = (slug: string) => {
    if (closed || !options.isBotActive(slug)) throw new MessagingError('bot-unavailable');
    const context = approvals.managementDestination(slug);
    if (
      !context.provider.qualifyReply ||
      !context.provider.reply ||
      !context.paired.messageIds?.[0]
    )
      throw new MessagingError('capability-unavailable');
    if (
      database.read((db) =>
        readBlock(db, slug, context.identity.fingerprint, {
          kind: 'dm',
          id: context.paired.conversationId,
        }),
      )
    )
      throw new MessagingError('conversation-blocked');
    return context;
  };
  const valid = (value: FailureAlertDelivery) => {
    try {
      const current = settings(value.botSlug);
      if (!current.enabled || current.revision !== value.settingsRevision || !value.route)
        return false;
      const context = destination(value.botSlug);
      return (
        JSON.stringify(context.route) === JSON.stringify(value.route) &&
        (value.sessionId === undefined ||
          (value.role !== undefined &&
            options.ownsFailure(value.botSlug, value.sessionId, value.role)))
      );
    } catch {
      return false;
    }
  };
  const text = (value: FailureAlertDelivery) =>
    value.sessionId
      ? `Bot work failed / Bot 工作失败\n${value.role} · ${value.sessionId}\nReference / 记录: ${value.id}\nInspect the original failure in Web. This notice grants no decision permission. / 请在 Web 查看原始失败；此通知不授予决策权限。`
      : `Work-failure alert test / 工作失败通知测试\nReference / 记录: ${value.id}\nNo work failed. This notice grants no decision permission. / 没有工作失败；此通知不授予决策权限。`;
  const send = async (id: string): Promise<FailureAlertDelivery> => {
    let value = read(id);
    if (
      closed ||
      busy.has(id) ||
      !['pending', 'failed'].includes(value.state) ||
      value.attempts >= 3
    )
      return value;
    const startedAt = performance.now();
    busy.add(id);
    let started = false;
    try {
      if (!valid(value)) {
        write({ ...value, state: 'cancelled', reason: 'authorization-changed' });
        return read(id);
      }
      const context = destination(value.botSlug);
      value = { ...value, attempts: value.attempts + 1 };
      write(value);
      const currentDestination = () => {
        try {
          return valid(value) && destination(value.botSlug).provider === context.provider;
        } catch {
          return false;
        }
      };
      const result = await boundedMessagingDelivery(lifetime.signal, async (signal) => {
        const route = await context.provider.qualifyReply!({
          accountRef: context.identity.accountRef,
          fingerprint: context.identity.fingerprint,
          route: {
            messageId: context.paired.messageIds![0]!,
            conversationId: context.paired.conversationId,
            actorId: context.paired.actorId,
          },
          signal,
        });
        if (!currentDestination() || signal.aborted)
          throw new MessagingProviderError('authorization-changed', 'not-started');
        write({ ...value, state: 'sending' });
        started = true;
        return context.provider.reply!({
          accountRef: context.identity.accountRef,
          fingerprint: context.identity.fingerprint,
          route,
          text: text(value),
          signal,
          beforeSend: currentDestination,
        });
      });
      if (!result.receipt || result.receipt.conversationId !== context.paired.conversationId)
        throw new MessagingProviderError('provider-result-unknown', 'unknown');
      write({ ...value, state: 'provider-accepted', receipt: result.receipt });
    } catch (error) {
      const definite =
        !started ||
        (error instanceof MessagingProviderError && error.disposition === 'not-started');
      const reason =
        (error instanceof MessagingError || error instanceof MessagingProviderError) &&
        /^[a-z0-9-]{1,80}$/.test(error.code)
          ? error.code
          : 'provider-result-unknown';
      write({ ...value, state: definite ? 'failed' : 'unknown-outcome', reason });
      if (definite && valid(value) && value.attempts < 3 && !closed) {
        const timer = setTimeout(
          () => {
            timers.delete(id);
            void send(id).catch(() => options.warn?.('failure-alert-retry-failed'));
          },
          Math.max(1, value.attempts) * 1000,
        );
        timer.unref();
        timers.set(id, timer);
      }
    } finally {
      busy.delete(id);
      const result = closed ? { ...value, state: 'unknown-outcome' as const } : read(id);
      options.warn?.(
        JSON.stringify({
          event: 'messaging-failure-alert',
          initiator: value.sessionId ? 'committed-work-failure' : 'authenticated-web',
          phase: 'send-finish',
          durationMs: Math.round(performance.now() - startedAt),
          id,
          state: result.state,
          reason: result.reason,
          attempts: result.attempts,
        }),
      );
    }
    return closed ? value : read(id);
  };
  const enqueue = (slug: string, failure?: ChannelMessageCommit) => {
    const current = settings(slug);
    if (!current.enabled) return;
    let route: ApprovalRoute | undefined;
    try {
      route = destination(slug).route;
    } catch {}
    const id = randomUUID();
    const eventKey = failure
      ? createHash('sha256')
          .update(JSON.stringify([slug, failure.channelId, failure.message.id]))
          .digest('hex')
      : id;
    const detail = failure?.message.sessionFailure;
    const value: FailureAlertDelivery = {
      id,
      botSlug: slug,
      settingsRevision: current.revision,
      createdAt: now(),
      state: route ? 'pending' : 'cancelled',
      attempts: 0,
      ...(route ? { route } : { reason: 'destination-unavailable' }),
      ...(failure && detail
        ? {
            channelId: failure.channelId,
            messageId: failure.message.id,
            sessionId: detail.sessionId,
            role: detail.role,
          }
        : {}),
    };
    const inserted = database.transaction(
      (db) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO messaging_failure_alert_deliveries(id,bot_slug,event_key,body) VALUES(?,?,?,?)',
          )
          .run(id, slug, eventKey, JSON.stringify(value)).changes,
      ['failure-alerts'],
    );
    if (!inserted) return;
    if (route)
      queueMicrotask(() => void send(id).catch(() => options.warn?.('failure-alert-send-failed')));
    return value;
  };
  if (options.recover !== false)
    database.transaction((db) =>
      db
        .prepare(
          "UPDATE messaging_failure_alert_deliveries SET body=json_set(body,'$.state',CASE WHEN json_extract(body,'$.state')='sending' THEN 'unknown-outcome' ELSE 'cancelled' END,'$.reason','host-restart') WHERE json_extract(body,'$.state') IN ('pending','sending')",
        )
        .run(),
    );
  return {
    snapshot(botSlug) {
      let available = false;
      try {
        destination(botSlug);
        available = true;
      } catch {}
      return {
        ...settings(botSlug),
        available,
        deliveries: database.read((db) =>
          (
            db
              .prepare(
                'SELECT body FROM messaging_failure_alert_deliveries WHERE bot_slug = ? ORDER BY rowid DESC LIMIT 20',
              )
              .all(botSlug) as { body: string }[]
          ).map((row) => JSON.parse(row.body) as FailureAlertDelivery),
        ),
      };
    },
    set(botSlug, enabled, expectedRevision) {
      if (closed || !options.isBotActive(botSlug)) throw new MessagingError('bot-unavailable');
      try {
        database.transaction(
          (db) => {
            if (settings(botSlug).revision !== expectedRevision)
              throw new MessagingError('failure-alert-settings-stale');
            db.prepare(
              'INSERT INTO messaging_failure_alert_settings(bot_slug,enabled,revision) VALUES(?,?,?) ON CONFLICT(bot_slug) DO UPDATE SET enabled=excluded.enabled,revision=excluded.revision',
            ).run(botSlug, enabled ? 1 : 0, expectedRevision + 1);
          },
          ['failure-alerts'],
        );
      } catch (error) {
        if (error instanceof OperationalDatabaseError && error.cause instanceof MessagingError)
          throw error.cause;
        throw error;
      }
    },
    async test(botSlug) {
      const value = enqueue(botSlug);
      if (!value) throw new MessagingError('failure-alert-disabled');
      return value.state === 'pending' ? send(value.id) : value;
    },
    async retry(botSlug, id) {
      const value = read(id);
      if (
        value.botSlug !== botSlug ||
        value.state !== 'failed' ||
        value.attempts >= 3 ||
        !valid(value)
      )
        throw new MessagingError('failure-alert-retry-unavailable');
      const timer = timers.get(id);
      if (timer) clearTimeout(timer);
      timers.delete(id);
      return send(id);
    },
    committed(commit) {
      const { message } = commit;
      const failure = message.sessionFailure;
      if (
        closed ||
        !failure ||
        message.author.kind !== 'bot' ||
        !options.ownsFailure(message.author.slug, failure.sessionId, failure.role)
      )
        return;
      enqueue(message.author.slug, commit);
    },
    close() {
      closed = true;
      lifetime.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
