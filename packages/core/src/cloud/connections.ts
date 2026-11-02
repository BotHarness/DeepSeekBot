import { randomUUID } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { ClientError } from './instance-contract.js';
import {
  CloudTransport,
  connectionFor,
  parseCloudCredential,
  type CloudConnection,
} from './transport.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;
type Row = {
  id: string;
  connection_json: string;
  credential_revision: string;
  active: number;
  cursor: number;
  policy_json: string;
  revision: number;
};
export type CloudPolicy = { allowedUsers: string[]; forwardTargets: string[]; environment: string };
const emptyPolicy = (): CloudPolicy => ({
  allowedUsers: [],
  forwardTargets: [],
  environment: 'local-host',
});
export function parsePolicy(value: unknown): CloudPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ClientError('INVALID_CLOUD_POLICY');
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).some((k) => !['allowedUsers', 'forwardTargets', 'environment'].includes(k)) ||
    !Array.isArray(p.allowedUsers) ||
    !Array.isArray(p.forwardTargets) ||
    p.allowedUsers.length > 100 ||
    p.forwardTargets.length > 20 ||
    p.allowedUsers.some((u) => typeof u !== 'string' || !/^user_[A-Za-z0-9]+$/.test(u)) ||
    p.forwardTargets.some((a) => typeof a !== 'string' || !/^ag_[a-f0-9]{64}$/.test(a)) ||
    typeof p.environment !== 'string' ||
    !/^[A-Za-z0-9_. -]{1,64}$/.test(p.environment) ||
    new Set(p.allowedUsers).size !== p.allowedUsers.length ||
    new Set(p.forwardTargets).size !== p.forwardTargets.length
  )
    throw new ClientError('INVALID_CLOUD_POLICY');
  return {
    allowedUsers: [...p.allowedUsers] as string[],
    forwardTargets: [...p.forwardTargets] as string[],
    environment: p.environment,
  };
}
function nativePayload(
  value: unknown,
): { id: string; revision: string; secret: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const p = value as Record<string, unknown>;
  if (
    typeof p.id !== 'string' ||
    typeof p.revision !== 'string' ||
    typeof p.secret !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.secret)
  )
    return undefined;
  return { id: p.id, revision: p.revision, secret: p.secret };
}
export class CloudConnections {
  readonly transport: CloudTransport;
  readonly #locks = new Map<string, Promise<unknown>>();
  readonly #active = new Map<string, Set<AbortController>>();
  #closed = false;
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly credentials: () => Credentials | undefined,
    transport = new CloudTransport(),
    private readonly log: (phase: string, id: string) => void = () => {},
  ) {
    this.transport = transport;
  }
  private row(id: string): Row | undefined {
    return this.db.read((db) =>
      db.prepare('SELECT * FROM cloud_connections WHERE id=?').get(id),
    ) as Row | undefined;
  }
  private native() {
    const c = this.credentials();
    if (!c) throw new ClientError('CLOUD_CREDENTIAL_UNAVAILABLE');
    return c;
  }
  private key(id: string) {
    if (!/^cloud-[a-f0-9]{64}$/.test(id)) throw new ClientError('INVALID_CLOUD_CONNECTION');
    return credentialKey('botharness-core', id);
  }
  private async exclusive<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(id) ?? Promise.resolve();
    const result = previous
      .catch(() => undefined)
      .then(() => {
        if (this.#closed) throw new ClientError('CLOUD_CLOSED');
        return task();
      });
    this.#locks.set(id, result);
    try {
      return await result;
    } finally {
      if (this.#locks.get(id) === result) this.#locks.delete(id);
    }
  }
  private view(row: Row) {
    return {
      connection: JSON.parse(row.connection_json) as CloudConnection,
      active: row.active === 1,
      revision: row.revision,
      cursor: row.cursor,
      policy: parsePolicy(JSON.parse(row.policy_json)),
    };
  }
  list() {
    return this.db.read((db) =>
      (db.prepare('SELECT * FROM cloud_connections ORDER BY id').all() as unknown as Row[]).map(
        (r) => this.view(r),
      ),
    );
  }
  get(id: string) {
    this.key(id);
    const row = this.row(id);
    if (!row) throw new ClientError('CLOUD_CONNECTION_UNAVAILABLE');
    return this.view(row);
  }
  current(id: string) {
    if (this.#closed) throw new ClientError('CLOUD_CLOSED');
    const v = this.get(id);
    if (!v.active) throw new ClientError('CLOUD_CONNECTION_DISABLED');
    return v;
  }
  async secret(id: string) {
    this.current(id);
    const row = this.row(id)!;
    let record;
    try {
      record = await this.native().readRecord(this.key(id));
    } catch {
      throw new ClientError('CLOUD_CREDENTIAL_UNAVAILABLE');
    }
    this.current(id);
    const value = record?.kind === 'grant' ? nativePayload(record.payload) : undefined;
    if (
      !value ||
      value.id !== id ||
      value.revision !== row.credential_revision ||
      this.row(id)?.credential_revision !== row.credential_revision
    )
      throw new ClientError('CLOUD_CREDENTIAL_UNAVAILABLE');
    return value.secret;
  }
  async import(value: unknown) {
    const input = parseCloudCredential(value),
      connection = connectionFor(input),
      id = connection.id;
    return this.exclusive(id, async () => {
      const controller = new AbortController();
      const remote = await this.transport.call(
        connection,
        async () => input.secret,
        '/identity',
        controller.signal,
      );
      const agent = remote.agent as Record<string, unknown> | undefined;
      if (
        remote.channelId !== connection.channelId ||
        remote.organizationId !== connection.organizationId ||
        agent?.actorId !== connection.actorId ||
        agent.kind !== 'agent' ||
        agent.ownerUserId !== connection.ownerUserId ||
        agent.state !== 'active' ||
        !Number.isSafeInteger(agent.historyAfter) ||
        Number(agent.historyAfter) < 0 ||
        typeof agent.name !== 'string' ||
        !agent.name.trim() ||
        agent.name.length > 80
      )
        throw new ClientError('CLOUD_IDENTITY_MISMATCH');
      connection.name = agent.name;
      if (this.#closed) throw new ClientError('CLOUD_CLOSED');
      const native = this.native(),
        key = this.key(id),
        old = this.row(id);
      const candidate = {
        id,
        revision: old?.credential_revision ?? randomUUID(),
        secret: input.secret,
      };
      let committed: ReturnType<typeof nativePayload>;
      try {
        await native.modifyRecord(key, async (record) => {
          const current = record?.kind === 'grant' ? nativePayload(record.payload) : undefined;
          if (
            record &&
            (!current ||
              current.id !== id ||
              current.secret !== input.secret ||
              (old && current.revision !== old.credential_revision))
          )
            throw new ClientError('CLOUD_CREDENTIAL_CONFLICT');
          committed = current ?? candidate;
          return { kind: 'grant', payload: { ...committed } };
        });
      } catch (error) {
        if (error instanceof ClientError) throw error;
      }
      const record = await native.readRecord(key).catch(() => undefined);
      const read = record?.kind === 'grant' ? nativePayload(record.payload) : undefined;
      const expected = committed ?? candidate;
      if (
        !read ||
        read.id !== id ||
        read.revision !== expected.revision ||
        read.secret !== input.secret
      )
        throw new ClientError('CLOUD_CREDENTIAL_UNAVAILABLE');
      if (this.#closed) throw new ClientError('CLOUD_CLOSED');
      if (old?.active && old.connection_json !== JSON.stringify(connection))
        throw new ClientError('CLOUD_CONNECTION_CHANGED');
      this.db.transaction((db) => {
        if (old?.active) return;
        db.prepare(
          'INSERT INTO cloud_connections (id,connection_json,credential_revision,active,cursor,policy_json,revision) VALUES (?,?,?,1,?,?,1) ON CONFLICT(id) DO UPDATE SET connection_json=excluded.connection_json,credential_revision=excluded.credential_revision,active=1,policy_json=excluded.policy_json,revision=cloud_connections.revision+1',
        ).run(
          id,
          JSON.stringify(connection),
          read.revision,
          Number(agent.historyAfter),
          JSON.stringify(emptyPolicy()),
        );
      });
      this.log('imported', id);
      return this.get(id);
    });
  }
  async remove(id: string, expectedRevision: number) {
    return this.exclusive(id, async () => {
      const old = this.get(id);
      if (old.revision !== expectedRevision) throw new ClientError('CLOUD_CONNECTION_CHANGED');
      this.db.transaction((db) => {
        if (old.active)
          db.prepare('UPDATE cloud_connections SET active=0,revision=revision+1 WHERE id=?').run(
            id,
          );
      });
      for (const controller of this.#active.get(id) ?? []) controller.abort();
      let credentialRemoved = false;
      try {
        await this.native().deleteRecord(this.key(id));
        credentialRemoved = !(await this.native().readRecord(this.key(id)));
      } catch {}
      this.log(credentialRemoved ? 'removed' : 'credential-removal-pending', id);
      return { ...this.get(id), credentialRemoved };
    });
  }
  setPolicy(id: string, expectedRevision: number, value: unknown) {
    const policy = parsePolicy(value);
    const current = this.current(id);
    if (current.revision !== expectedRevision) throw new ClientError('CLOUD_CONNECTION_CHANGED');
    if (policy.forwardTargets.includes(current.connection.actorId))
      throw new ClientError('INVALID_CLOUD_POLICY');
    return this.db.transaction((db) => {
      db.prepare('UPDATE cloud_connections SET policy_json=?,revision=revision+1 WHERE id=?').run(
        JSON.stringify(policy),
        id,
      );
      return this.get(id);
    });
  }
  advance(id: string, previous: number, next: number) {
    if (!Number.isSafeInteger(next) || next < previous)
      throw new ClientError('INVALID_CLOUD_CURSOR');
    this.current(id);
    const changes = this.db.transaction(
      (db) =>
        db
          .prepare('UPDATE cloud_connections SET cursor=? WHERE id=? AND cursor=?')
          .run(next, id, previous).changes,
    );
    if (changes !== 1) throw new ClientError('CLOUD_CURSOR_CHANGED');
  }
  async call(
    id: string,
    path: string,
    signal: AbortSignal,
    body?: unknown,
    operationId?: string,
    beforeSend?: () => boolean,
  ) {
    const controller = new AbortController();
    let set = this.#active.get(id);
    if (!set) {
      set = new Set();
      this.#active.set(id, set);
    }
    set.add(controller);
    try {
      return await this.transport.call(
        this.current(id).connection,
        () => this.secret(id),
        path,
        AbortSignal.any([signal, controller.signal]),
        body,
        operationId,
        beforeSend,
      );
    } finally {
      set.delete(controller);
      if (!set.size) this.#active.delete(id);
    }
  }
  async close() {
    this.#closed = true;
    for (const set of this.#active.values()) for (const controller of set) controller.abort();
    await Promise.allSettled(this.#locks.values());
  }
}
