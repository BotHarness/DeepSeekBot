import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { dmChannelId } from '../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MemoryAcceptance } from '../memory/accepted-types.js';
import { requireSourceEffects } from '../purge/fence.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { botOwner } from '../team/bot-access.js';
import { TobError } from './service.js';

export const TOB_MEMORY_LEASE_READ_KINDS = ['snapshot', 'file', 'history', 'diff'] as const;
export type TobMemoryLeaseReadKind = (typeof TOB_MEMORY_LEASE_READ_KINDS)[number];

export const TOB_MEMORY_LEASE_ERROR_CODES = [
  'lease-unavailable',
  'lease-target-denied',
  'lease-target-unavailable',
  'lease-source-revoked',
  'lease-expired',
  'lease-read-only',
  'lease-key-conflict',
  'lease-exists',
  'lease-read-limit',
  'unknown-assignment',
] as const;

const MAX_TARGETS = 8;
const MAX_READS = 200;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_FILES = 500;
const MAX_HISTORY = 50;
const RECENT_READS = 20;
const MAX_FOOTER_CHARS = 1_200;

interface LeaseTarget {
  slug: string;
  createdAt: string;
}

interface LeaseRow {
  lease_id: string;
  tob_slug: string;
  lease_key: string;
  assignment_session_id: string;
  source_channel_id: string;
  source_event_ids_json: string;
  targets_json: string;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}

interface ReadRow {
  seq: number;
  bot_slug: string;
  kind: string;
  path: string | null;
  revision: string | null;
  bytes: number;
  sha256: string | null;
  truncated: number;
  outcome: string;
  read_at: string;
}

export interface TobMemoryLeaseProvenance {
  seq: number;
  bot: string;
  kind: string;
  path?: string;
  revision: string | null;
  bytes: number;
  sha256?: string;
  truncated: boolean;
  outcome: string;
  at: string;
}

export interface TobMemoryLeaseView {
  leaseId: string;
  leaseKey: string;
  assignment: string;
  state: 'active' | 'revoked' | 'expired';
  status: 'complete' | 'partial';
  access: 'read-only';
  kinds: readonly TobMemoryLeaseReadKind[];
  createdAt: string;
  revokedAt?: string;
  revokeReason?: string;
  sourceEvents: number;
  bots: Array<{
    slug: string;
    status: 'read' | 'unread' | 'refused';
    reads: number;
    revision: string | null;
  }>;
  reads: TobMemoryLeaseProvenance[];
  readCount: number;
}

export interface TobMemoryLeaseRead {
  leaseId: string;
  bot: string;
  kind: TobMemoryLeaseReadKind;
  provenance: TobMemoryLeaseProvenance;
  value: unknown;
}

export interface TobMemoryLeases {
  grant(input: {
    tobSlug: string;
    leaseKey: string;
    assignmentSessionId: string;
    sourceEventIds: readonly string[];
    bots: readonly string[];
  }): TobMemoryLeaseView;
  list(input: { tobSlug: string; assignmentSessionId?: string }): TobMemoryLeaseView[];
  revoke(input: { tobSlug: string; leaseId: string; reason?: string }): TobMemoryLeaseView;
  active(assignmentSessionId: string): TobMemoryLeaseView | undefined;
  read(input: {
    assignmentSessionId: string;
    bot: string;
    kind: string;
    path?: string;
    sha?: string;
    limit?: number;
  }): TobMemoryLeaseRead;
  reportFooter(assignmentSessionId: string): string | undefined;
}

export interface TobMemoryLeaseDeps {
  database: OperationalDatabaseModulePort;
  registry: Pick<PersonaBotRegistry, 'get'>;
  ownership: Pick<SessionOwnership, 'resolve' | 'contentAvailable'>;
  memory: () => Pick<MemoryAcceptance, 'snapshot' | 'readAccepted' | 'history' | 'diff'>;
  mayManageBots(slug: string): boolean;
  now?: () => Date;
}

function refuse(code: string): never {
  throw new TobError(code);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function bounded(text: string): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= MAX_BODY_BYTES) return { text, truncated: false };
  return {
    text: bytes.subarray(0, MAX_BODY_BYTES).toString('utf8').replace(/�$/u, ''),
    truncated: true,
  };
}

export function createTobMemoryLeases(deps: TobMemoryLeaseDeps): TobMemoryLeases {
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const rowFor = (leaseId: string) =>
    deps.database.read(
      (db) =>
        db.prepare('SELECT * FROM tob_memory_leases WHERE lease_id = ?').get(leaseId) as
          | LeaseRow
          | undefined,
    );
  const readsFor = (leaseId: string) =>
    deps.database.read(
      (db) =>
        db
          .prepare('SELECT * FROM tob_memory_lease_reads WHERE lease_id = ? ORDER BY seq')
          .all(leaseId) as unknown as ReadRow[],
    );
  const targets = (row: LeaseRow) => JSON.parse(row.targets_json) as LeaseTarget[];
  const sources = (row: LeaseRow) => JSON.parse(row.source_event_ids_json) as string[];

  const assignmentDenial = (tobSlug: string, sessionId: string): string | undefined => {
    const owner = deps.ownership.resolve(sessionId);
    if (
      owner?.botSlug !== tobSlug ||
      owner.rootRole !== 'assignment' ||
      owner.parentSessionId !== undefined
    )
      return 'unknown-assignment';
    const assignment = deps.database.read(
      (db) =>
        db
          .prepare('SELECT archived_at FROM assignments WHERE bot_slug = ? AND session_id = ?')
          .get(tobSlug, sessionId) as { archived_at: string | null } | undefined,
    );
    if (!assignment) return 'unknown-assignment';
    if (!deps.ownership.contentAvailable(sessionId) || assignment.archived_at !== null)
      return 'lease-expired';
    return undefined;
  };

  const tobOwner = (tobSlug: string): string => {
    const tob = deps.registry.get(tobSlug);
    if (!tob || !deps.mayManageBots(tobSlug)) refuse('tob-authority-required');
    return botOwner(tob);
  };

  const sourceDenial = (row: LeaseRow): string | undefined => {
    const owner = deps.registry.get(row.tob_slug);
    if (
      !owner ||
      !deps.mayManageBots(row.tob_slug) ||
      row.source_channel_id !== dmChannelId(row.tob_slug)
    )
      return 'lease-source-revoked';
    try {
      deps.database.read((db) => {
        for (const id of sources(row)) {
          const event = db
            .prepare(
              'SELECT source_kind, channel_id, human_id FROM source_events WHERE source_event_id = ?',
            )
            .get(id);
          if (
            event?.source_kind !== 'human-message' ||
            event.channel_id !== row.source_channel_id ||
            (event.human_id ?? 'local-human') !== botOwner(owner)
          )
            throw new Error('source');
          requireSourceEffects(db, id, row.tob_slug);
        }
      });
    } catch {
      return 'lease-source-revoked';
    }
    return undefined;
  };

  const targetDenial = (row: LeaseRow, target: LeaseTarget): string | undefined => {
    const bot = deps.registry.get(target.slug);
    const tob = deps.registry.get(row.tob_slug);
    if (!bot || !tob || bot.createdAt !== target.createdAt || bot.paused === true)
      return 'lease-target-unavailable';
    if (botOwner(bot) !== botOwner(tob)) return 'lease-target-denied';
    return undefined;
  };

  const state = (row: LeaseRow): TobMemoryLeaseView['state'] => {
    if (row.revoked_at !== null) return 'revoked';
    if (assignmentDenial(row.tob_slug, row.assignment_session_id) !== undefined) return 'expired';
    if (sourceDenial(row) !== undefined) return 'expired';
    return 'active';
  };

  const provenance = (read: ReadRow): TobMemoryLeaseProvenance => ({
    seq: read.seq,
    bot: read.bot_slug,
    kind: read.kind,
    ...(read.path === null ? {} : { path: read.path }),
    revision: read.revision,
    bytes: read.bytes,
    ...(read.sha256 === null ? {} : { sha256: read.sha256 }),
    truncated: read.truncated === 1,
    outcome: read.outcome,
    at: read.read_at,
  });

  const view = (row: LeaseRow): TobMemoryLeaseView => {
    const reads = readsFor(row.lease_id);
    const bots = targets(row).map((target) => {
      const mine = reads.filter((read) => read.bot_slug === target.slug);
      const ok = mine.filter((read) => read.outcome === 'ok');
      return {
        slug: target.slug,
        status: (ok.length > 0 ? 'read' : mine.length > 0 ? 'refused' : 'unread') as
          | 'read'
          | 'unread'
          | 'refused',
        reads: ok.length,
        revision: ok.findLast((read) => read.revision !== null)?.revision ?? null,
      };
    });
    const complete =
      bots.every((bot) => bot.status === 'read') &&
      reads.every((read) => read.outcome === 'ok' && read.truncated === 0);
    return {
      leaseId: row.lease_id,
      leaseKey: row.lease_key,
      assignment: row.assignment_session_id,
      state: state(row),
      status: complete ? 'complete' : 'partial',
      access: 'read-only',
      kinds: TOB_MEMORY_LEASE_READ_KINDS,
      createdAt: row.created_at,
      ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
      ...(row.revoke_reason === null ? {} : { revokeReason: row.revoke_reason }),
      sourceEvents: sources(row).length,
      bots,
      reads: reads.slice(-RECENT_READS).map(provenance),
      readCount: reads.length,
    };
  };

  const activeRow = (assignmentSessionId: string): LeaseRow | undefined =>
    deps.database.read(
      (db) =>
        db
          .prepare(
            `SELECT * FROM tob_memory_leases
             WHERE assignment_session_id = ? AND revoked_at IS NULL
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(assignmentSessionId) as LeaseRow | undefined,
    );

  const latestRow = (assignmentSessionId: string): LeaseRow | undefined =>
    deps.database.read(
      (db) =>
        db
          .prepare(
            `SELECT * FROM tob_memory_leases
             WHERE assignment_session_id = ?
             ORDER BY created_at DESC, rowid DESC LIMIT 1`,
          )
          .get(assignmentSessionId) as LeaseRow | undefined,
    );

  const record = (
    row: LeaseRow,
    entry: Omit<ReadRow, 'seq' | 'read_at'>,
  ): TobMemoryLeaseProvenance => {
    const recorded = deps.database.transaction((db): TobMemoryLeaseProvenance | undefined => {
      const count = (
        db
          .prepare('SELECT COUNT(*) AS n FROM tob_memory_lease_reads WHERE lease_id = ?')
          .get(row.lease_id) as { n: number }
      ).n;
      if (count >= MAX_READS) return undefined;
      const read: ReadRow = { ...entry, seq: count + 1, read_at: now() };
      db.prepare(
        `INSERT INTO tob_memory_lease_reads
         (lease_id, seq, bot_slug, kind, path, revision, bytes, sha256, truncated, outcome, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.lease_id,
        read.seq,
        read.bot_slug,
        read.kind,
        read.path,
        read.revision,
        read.bytes,
        read.sha256,
        read.truncated,
        read.outcome,
        read.read_at,
      );
      return provenance(read);
    });
    if (recorded === undefined) refuse('lease-read-limit');
    return recorded;
  };

  const memoryRead = (
    slug: string,
    kind: TobMemoryLeaseReadKind,
    input: { path?: string; sha?: string; limit?: number },
  ): {
    value: unknown;
    revision: string | null;
    path?: string;
    bytes: number;
    sha256?: string;
    truncated: boolean;
  } => {
    const memory = deps.memory();
    switch (kind) {
      case 'snapshot': {
        const snapshot = memory.snapshot(slug);
        const files = snapshot.files.slice(0, MAX_FILES);
        const text = JSON.stringify(files);
        return {
          value: {
            head: snapshot.head,
            files,
            provisional: snapshot.provisional,
          },
          revision: snapshot.head,
          bytes: Buffer.byteLength(text),
          sha256: sha256(text),
          truncated: snapshot.files.length > MAX_FILES,
        };
      }
      case 'file': {
        const path = input.path;
        if (!path || path.length > 512) refuse('invalid-input');
        const file = memory.readAccepted(slug, path);
        if (file === undefined)
          return {
            value: { path, exists: false },
            revision: memory.snapshot(slug).head,
            path,
            bytes: 0,
            truncated: false,
          };
        if (file.binary === true)
          return {
            value: { path: file.path, exists: true, binary: true },
            revision: file.head,
            path: file.path,
            bytes: 0,
            truncated: false,
          };
        const body = bounded(file.body);
        return {
          value: {
            path: file.path,
            exists: true,
            body: body.text,
            truncated: body.truncated,
          },
          revision: file.head,
          path: file.path,
          bytes: Buffer.byteLength(file.body),
          sha256: sha256(file.body),
          truncated: body.truncated,
        };
      }
      case 'history': {
        const limit = input.limit ?? 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY) refuse('invalid-input');
        const commits = memory.history(slug, limit).map((commit) => ({
          sha: commit.sha,
          parentSha: commit.parentSha,
          actorKind: commit.actorKind,
          causeKind: commit.causeKind,
          acceptedAt: commit.acceptedAt,
        }));
        const text = JSON.stringify(commits);
        return {
          value: { commits },
          revision: commits[0]?.sha ?? null,
          bytes: Buffer.byteLength(text),
          sha256: sha256(text),
          truncated: false,
        };
      }
      case 'diff': {
        const sha = input.sha;
        if (!sha || !/^[0-9a-f]{40}$/u.test(sha)) refuse('invalid-input');
        const result = memory.diff(slug, sha);
        const diff = bounded(result.diff);
        return {
          value: {
            sha: result.sha,
            diff: diff.text,
            truncated: diff.truncated,
          },
          revision: result.sha,
          bytes: Buffer.byteLength(result.diff),
          sha256: sha256(result.diff),
          truncated: diff.truncated,
        };
      }
    }
  };

  return {
    grant(input) {
      const owner = tobOwner(input.tobSlug);
      const key = input.leaseKey;
      if (!key || key.length > 100 || [...key].some((char) => char.charCodeAt(0) < 32))
        refuse('invalid-input');
      const assignment = assignmentDenial(input.tobSlug, input.assignmentSessionId);
      if (assignment !== undefined) refuse(assignment);
      if (input.sourceEventIds.length === 0) refuse('human-dm-required');
      const slugs = [...new Set(input.bots.map((slug) => slug.trim()))];
      if (slugs.length === 0 || slugs.length > MAX_TARGETS || slugs.length !== input.bots.length)
        refuse('invalid-input');
      const chosen: LeaseTarget[] = slugs.map((slug) => {
        const bot: PersonaBotRecord | undefined = deps.registry.get(slug);
        if (!bot) refuse('unknown-bot');
        if (botOwner(bot) !== owner) refuse('permission-required');
        if (bot.paused === true) refuse('lease-target-unavailable');
        return { slug: bot.slug, createdAt: bot.createdAt };
      });
      const sourceIds = [...input.sourceEventIds].sort();
      const row: LeaseRow = {
        lease_id: randomUUID(),
        tob_slug: input.tobSlug,
        lease_key: key,
        assignment_session_id: input.assignmentSessionId,
        source_channel_id: dmChannelId(input.tobSlug),
        source_event_ids_json: JSON.stringify(sourceIds),
        targets_json: JSON.stringify(chosen),
        created_at: now(),
        revoked_at: null,
        revoke_reason: null,
      };
      const denial = sourceDenial(row);
      if (denial !== undefined) refuse(denial);
      const stored = deps.database.transaction((db): LeaseRow | string => {
        const prior = db
          .prepare('SELECT * FROM tob_memory_leases WHERE tob_slug = ? AND lease_key = ?')
          .get(input.tobSlug, key) as LeaseRow | undefined;
        if (prior) {
          return prior.assignment_session_id === row.assignment_session_id &&
            isDeepStrictEqual(
              (JSON.parse(prior.targets_json) as LeaseTarget[]).map((target) => target.slug),
              chosen.map((target) => target.slug),
            )
            ? prior
            : 'lease-key-conflict';
        }
        const active = db
          .prepare(
            'SELECT 1 FROM tob_memory_leases WHERE assignment_session_id = ? AND revoked_at IS NULL',
          )
          .get(row.assignment_session_id);
        if (active) return 'lease-exists';
        db.prepare(
          `INSERT INTO tob_memory_leases
           (lease_id, tob_slug, lease_key, assignment_session_id, source_channel_id,
            source_event_ids_json, targets_json, created_at, revoked_at, revoke_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        ).run(
          row.lease_id,
          row.tob_slug,
          row.lease_key,
          row.assignment_session_id,
          row.source_channel_id,
          row.source_event_ids_json,
          row.targets_json,
          row.created_at,
        );
        return row;
      });
      if (typeof stored === 'string') refuse(stored);
      return view(stored);
    },
    list(input) {
      tobOwner(input.tobSlug);
      const rows = deps.database.read(
        (db) =>
          (input.assignmentSessionId === undefined
            ? db
                .prepare(
                  'SELECT * FROM tob_memory_leases WHERE tob_slug = ? ORDER BY created_at DESC LIMIT 50',
                )
                .all(input.tobSlug)
            : db
                .prepare(
                  'SELECT * FROM tob_memory_leases WHERE tob_slug = ? AND assignment_session_id = ? ORDER BY created_at DESC LIMIT 50',
                )
                .all(input.tobSlug, input.assignmentSessionId)) as unknown as LeaseRow[],
      );
      return rows.map(view);
    },
    revoke(input) {
      tobOwner(input.tobSlug);
      const row = rowFor(input.leaseId);
      if (!row || row.tob_slug !== input.tobSlug) refuse('lease-unavailable');
      if (row.revoked_at === null)
        deps.database.transaction((db) => {
          db.prepare(
            'UPDATE tob_memory_leases SET revoked_at = ?, revoke_reason = ? WHERE lease_id = ? AND revoked_at IS NULL',
          ).run(now(), (input.reason ?? 'revoked').slice(0, 200), row.lease_id);
        });
      return view(rowFor(row.lease_id)!);
    },
    active(assignmentSessionId) {
      const row = activeRow(assignmentSessionId);
      return row === undefined ? undefined : view(row);
    },
    read(input) {
      if (
        !(TOB_MEMORY_LEASE_READ_KINDS as readonly string[]).includes(input.kind) ||
        typeof input.bot !== 'string'
      )
        refuse(
          ['save', 'restore', 'write', 'move', 'repair'].includes(input.kind)
            ? 'lease-read-only'
            : 'invalid-input',
        );
      const kind = input.kind as TobMemoryLeaseReadKind;
      const row = activeRow(input.assignmentSessionId);
      if (!row) refuse('lease-unavailable');
      const assignment = assignmentDenial(row.tob_slug, row.assignment_session_id);
      if (assignment !== undefined)
        refuse(assignment === 'unknown-assignment' ? 'lease-expired' : assignment);
      const source = sourceDenial(row);
      if (source !== undefined) refuse(source);
      const target = targets(row).find((candidate) => candidate.slug === input.bot);
      if (!target) refuse('lease-target-denied');
      const denial = targetDenial(row, target);
      const base = {
        bot_slug: target.slug,
        kind,
        path: kind === 'file' ? (input.path ?? null) : null,
      };
      if (denial !== undefined) {
        record(row, {
          ...base,
          revision: null,
          bytes: 0,
          sha256: null,
          truncated: 0,
          outcome: denial,
        });
        refuse(denial);
      }
      const result = memoryRead(target.slug, kind, input);
      const entry = record(row, {
        ...base,
        path: result.path ?? base.path,
        revision: result.revision,
        bytes: result.bytes,
        sha256: result.sha256 ?? null,
        truncated: result.truncated ? 1 : 0,
        outcome: 'ok',
      });
      return {
        leaseId: row.lease_id,
        bot: target.slug,
        kind,
        provenance: entry,
        value: result.value,
      };
    },
    reportFooter(assignmentSessionId) {
      const row = latestRow(assignmentSessionId);
      if (!row) return undefined;
      const lease = view(row);
      const paths = (slug: string) => [
        ...new Set(
          readsFor(row.lease_id)
            .filter((read) => read.bot_slug === slug && read.outcome === 'ok' && read.path)
            .map((read) => read.path!),
        ),
      ];
      const lines = [
        `Memory lease ${lease.leaseId} (${lease.state}, ${lease.status}, read-only):`,
        ...lease.bots.map((bot) => {
          const files = paths(bot.slug);
          return `- ${bot.slug}: ${bot.status}${bot.revision === null ? '' : ` at ${bot.revision}`} (${bot.reads} reads${files.length === 0 ? '' : `; ${files.join(', ')}`})`;
        }),
        ...(lease.reads.some((read) => read.truncated) ? ['- some reads were truncated'] : []),
      ];
      const text = lines.join('\n');
      return text.length <= MAX_FOOTER_CHARS ? text : `${text.slice(0, MAX_FOOTER_CHARS - 1)}…`;
    },
  };
}
