import { createHash } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { InboundMessaging } from '../messaging/inbound.js';
import { cloudWorkIdentityAllowed } from './admission.js';
import type { CloudConnections } from './connections.js';
import { ClientError } from './instance-contract.js';
import {
  parseWorkMessage,
  parseWorkRequest,
  parseWorkResult,
  type WorkRequest,
  type WorkResult,
} from './work-contract.js';

export type CloudWorkInput = {
  operation: 'inspect' | 'execute' | 'forward';
  source_event_id: string;
  target_actor_id?: string;
};
type Row = {
  connection_id: string;
  request_id: string;
  bot_slug: string;
  source_event_id: string;
  request_hash: string;
  state: 'authorizing' | 'started' | 'outbox' | 'finished' | 'forwarding' | 'forwarded';
  target_actor_id: string | null;
  environment: string;
  execution_count: number;
  outcome_json: string | null;
};
export function parseCloudWork(value: unknown): CloudWorkInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ClientError('INVALID_CLOUD_WORK');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !['operation', 'source_event_id', 'target_actor_id'].includes(k)) ||
    !['inspect', 'execute', 'forward'].includes(String(v.operation)) ||
    typeof v.source_event_id !== 'string' ||
    !/^[A-Za-z0-9:._-]{1,200}$/.test(v.source_event_id) ||
    (v.operation === 'forward'
      ? typeof v.target_actor_id !== 'string' || !/^ag_[a-f0-9]{64}$/.test(v.target_actor_id)
      : v.target_actor_id !== undefined)
  )
    throw new ClientError('INVALID_CLOUD_WORK');
  return v as CloudWorkInput;
}
const hash = (value: WorkRequest) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class CloudWork {
  readonly #locks = new Map<string, Promise<unknown>>();
  readonly #abort = new AbortController();
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly connections: CloudConnections,
    private readonly sources: Pick<InboundMessaging, 'read' | 'available' | 'sourceSignal'>,
    private readonly isActive: (slug: string) => boolean,
    private readonly log: (phase: string, requestId: string) => void = () => {},
    private readonly diagnose: () => NonNullable<WorkResult['diagnostics']> = () => ({
      platform: process.platform,
      architecture: process.arch,
      runtime: process.version,
    }),
  ) {}
  close() {
    this.#abort.abort();
  }
  private authority(bot: string, sourceId: string) {
    if (!this.isActive(bot) || !this.sources.available(bot, sourceId, true))
      throw new ClientError('CLOUD_WORK_SOURCE_UNAVAILABLE');
    const source = this.sources.read(bot, sourceId);
    if (!this.db.read((db) => cloudWorkIdentityAllowed(db, bot, source.event)))
      throw new ClientError('CLOUD_WORK_DENIED');
    const request = parseWorkRequest(source.event.cloudWork);
    const connection = this.connections.current(source.event.botId);
    return { source, request, connection };
  }
  private row(connection: string, request: string) {
    return this.db.read((db) =>
      db
        .prepare('SELECT * FROM cloud_work WHERE connection_id=? AND request_id=?')
        .get(connection, request),
    ) as Row | undefined;
  }
  async run(bot: string, input: CloudWorkInput, callerSignal: AbortSignal) {
    input = parseCloudWork(input);
    const initial = this.authority(bot, input.source_event_id);
    const key = initial.connection.connection.id + '/' + initial.request.requestId;
    const previous = this.#locks.get(key) ?? Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(() => this.process(bot, input, callerSignal));
    this.#locks.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.#locks.get(key) === pending) this.#locks.delete(key);
    }
  }
  private async process(bot: string, input: CloudWorkInput, callerSignal: AbortSignal) {
    const initial = this.authority(bot, input.source_event_id),
      r = initial.request,
      c = initial.connection;
    const id = c.connection.id,
      signature = hash(r);
    const signal = AbortSignal.any([
      callerSignal,
      this.#abort.signal,
      this.sources.sourceSignal(bot, input.source_event_id),
    ]);
    signal.throwIfAborted();
    let row = this.row(id, r.requestId);
    if (
      row &&
      (row.bot_slug !== bot ||
        row.source_event_id !== input.source_event_id ||
        row.request_hash !== signature)
    )
      throw new ClientError('CLOUD_WORK_CONFLICT');
    if (input.operation === 'inspect')
      return {
        request: r,
        state: row?.state ?? 'pending',
        forwardTargets: c.policy.forwardTargets,
        executionCount: row?.execution_count ?? 0,
      };
    const current = () => {
      signal.throwIfAborted();
      const live = this.authority(bot, input.source_event_id);
      if (
        live.connection.connection.id !== id ||
        hash(live.request) !== signature ||
        live.connection.policy.environment !== (row?.environment ?? c.policy.environment)
      )
        throw new ClientError('CLOUD_WORK_AUTHORITY_CHANGED');
      return live;
    };
    const allowed = () => {
      try {
        current();
        return true;
      } catch {
        return false;
      }
    };
    const save = (state: Row['state'], outcome?: WorkResult | WorkRequest) => {
      this.db.transaction((db) =>
        db
          .prepare(
            'UPDATE cloud_work SET state=?,outcome_json=? WHERE connection_id=? AND request_id=?',
          )
          .run(state, outcome ? JSON.stringify(outcome) : null, id, r.requestId),
      );
      row = this.row(id, r.requestId)!;
      this.log(state, r.requestId);
    };
    if (input.operation === 'forward') {
      const target = input.target_actor_id!;
      if (r.delegation || target === c.connection.actorId) throw new ClientError('FORWARD_LIMIT');
      if (!current().connection.policy.forwardTargets.includes(target))
        throw new ClientError('CLOUD_FORWARD_DENIED');
      if (
        row &&
        (!['forwarding', 'forwarded'].includes(row.state) || row.target_actor_id !== target)
      )
        throw new ClientError('CLOUD_WORK_CONFLICT');
      if (row?.state === 'forwarded')
        return {
          state: 'forwarded',
          request: parseWorkRequest(JSON.parse(row.outcome_json!)),
          replayed: true,
        };
      if (!row) {
        if (Date.parse(r.expiresAt) <= Date.now()) throw new ClientError('REQUEST_EXPIRED');
        this.claim(bot, input, id, r, 'forwarding', c.policy.environment, target);
        row = this.row(id, r.requestId)!;
      }
      const result = await this.connections.call(
        id,
        '/work-requests/' + r.requestId + '/forward',
        signal,
        { targetActorId: target },
        undefined,
        () => allowed() && current().connection.policy.forwardTargets.includes(target),
      );
      const forwarded = parseWorkMessage(result.message);
      if (
        forwarded.channelId !== r.channelId ||
        forwarded.targetActorId !== target ||
        forwarded.requesterUserId !== r.requesterUserId ||
        forwarded.capability !== r.capability ||
        forwarded.createdAt !== r.createdAt ||
        forwarded.expiresAt !== r.expiresAt ||
        forwarded.delegation?.parentRequestId !== r.requestId ||
        forwarded.delegation.actorId !== c.connection.actorId
      )
        throw new ClientError('INVALID_CLOUD_WORK_RESPONSE');
      save('forwarded', forwarded);
      return { state: 'forwarded', request: forwarded, replayed: result.replayed === true };
    }
    if (row && ['forwarding', 'forwarded'].includes(row.state))
      throw new ClientError('CLOUD_WORK_CONFLICT');
    if (row?.state === 'finished')
      return {
        state: 'finished',
        result: parseWorkResult(JSON.parse(row.outcome_json!)),
        executed: 0,
        replayed: true,
      };
    const rejection = (reason: WorkResult['reason']): WorkResult => ({
      version: 1,
      requestId: r.requestId,
      state: 'rejected',
      environment: row?.environment ?? c.policy.environment,
      executionCount: 0,
      reason,
    });
    let outcome: WorkResult;
    let executed = 0;
    if (row?.state === 'outbox') outcome = parseWorkResult(JSON.parse(row.outcome_json!));
    else if (row?.state === 'started')
      outcome = {
        version: 1,
        requestId: r.requestId,
        state: 'needs-review',
        environment: row.environment,
        executionCount: row.execution_count,
        reason: 'INTERRUPTED_EXECUTION',
      };
    else {
      if (!row) {
        this.claim(bot, input, id, r, 'authorizing', c.policy.environment);
        row = this.row(id, r.requestId)!;
      }
      let refused: WorkResult | undefined;
      if (Date.parse(r.expiresAt) <= Date.now()) refused = rejection('REQUEST_EXPIRED');
      else {
        try {
          const authorized = await this.connections.call(
            id,
            '/work-requests/' + r.requestId + '/authorize',
            signal,
            {},
            undefined,
            allowed,
          );
          if (hash(parseWorkRequest(authorized.request)) !== signature)
            throw new ClientError('CLOUD_WORK_CONFLICT');
        } catch (e) {
          if (
            e instanceof ClientError &&
            ['REQUEST_EXPIRED', 'REQUESTER_ACCESS_DENIED'].includes(e.code)
          )
            refused = rejection(e.code as WorkResult['reason']);
          else throw e;
        }
      }
      current();
      if (Date.parse(r.expiresAt) <= Date.now()) refused = rejection('REQUEST_EXPIRED');
      if (refused) outcome = refused;
      else {
        const claimed = this.db.transaction(
          (db) =>
            db
              .prepare(
                "UPDATE cloud_work SET state='started',execution_count=1 WHERE connection_id=? AND request_id=? AND state='authorizing'",
              )
              .run(id, r.requestId).changes,
        );
        if (claimed !== 1) throw new ClientError('CLOUD_WORK_CONFLICT');
        this.log('started', r.requestId);
        outcome = {
          version: 1,
          requestId: r.requestId,
          state: 'completed',
          environment: row.environment,
          executionCount: 1,
          reason: 'OK',
          diagnostics: this.diagnose(),
        };
        executed = 1;
      }
    }
    outcome = parseWorkResult(outcome);
    save('outbox', outcome);
    const sent = await this.connections.call(
      id,
      '/work-requests/' + r.requestId + '/result',
      signal,
      outcome,
      undefined,
      allowed,
    );
    const m = sent.message as
      | { kind?: unknown; authorId?: unknown; authorType?: unknown; payload?: unknown }
      | undefined;
    if (
      m?.kind !== 'work_result' ||
      m.authorType !== 'agent' ||
      m.authorId !== c.connection.actorId ||
      JSON.stringify(parseWorkResult(m.payload)) !== JSON.stringify(outcome)
    )
      throw new ClientError('INVALID_CLOUD_WORK_RESPONSE');
    save('finished', outcome);
    return { state: 'finished', result: outcome, executed, replayed: executed === 0 };
  }
  private claim(
    bot: string,
    input: CloudWorkInput,
    connection: string,
    request: WorkRequest,
    state: 'authorizing' | 'forwarding',
    environment: string,
    target?: string,
  ) {
    this.db.transaction((db) =>
      db
        .prepare(
          'INSERT INTO cloud_work(connection_id,request_id,bot_slug,source_event_id,request_hash,state,target_actor_id,environment,execution_count) VALUES(?,?,?,?,?,?,?,?,0)',
        )
        .run(
          connection,
          request.requestId,
          bot,
          input.source_event_id,
          hash(request),
          state,
          target ?? null,
          environment,
        ),
    );
    this.log(state, request.requestId);
  }
}
