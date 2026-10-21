import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  attachmentIdentity,
  isChannelAttachmentRef,
  isChannelClearedAttachment,
  type ChannelAttachmentRef,
} from '../attachments/ref.js';
import type { AttachmentStore } from '../attachments/store.js';
import type { ChannelRecord } from '../channels/channel.js';
import type { OperationalDatabaseOwner } from '../database/owner.js';
import { attachOperationalModule } from '../database/owner.js';

export const STORAGE_MEDIA_KINDS = ['image', 'video', 'audio', 'file'] as const;
export type StorageMediaKind = (typeof STORAGE_MEDIA_KINDS)[number];
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const UNFINISHED_ADMISSIONS = ['pending', 'running', 'retryable'];

export interface StorageMediaTotal {
  kind: StorageMediaKind;
  count: number;
  bytes: number;
}

export interface StorageChatUsage {
  channelId: string;
  name: string;
  type: ChannelRecord['type'];
  deleted?: true;
  messages: number;
  oldestAt?: string;
  mediaBytes: number;
  media: StorageMediaTotal[];
}

export interface StorageUsage {
  measuredAt: string;
  totalBytes: number;
  parts: { kind: 'media' | 'messages' | 'memory' | 'other'; bytes: number }[];
  chats: StorageChatUsage[];
}

export interface MediaCleanupScope {
  before: string;
  channelIds?: string[] | undefined;
  kinds?: StorageMediaKind[] | undefined;
}

export interface CleanupScope {
  before: string;
  channelIds: string[];
  kinds: StorageMediaKind[];
}

export interface MediaCleanupPreview {
  token: string;
  expiresAt: string;
  scope: CleanupScope;
  messages: number;
  files: number;
  bytes: number;
  freedBytes: number;
  kinds: StorageMediaTotal[];
  chats: { channelId: string; name: string; files: number; bytes: number }[];
  kept: { reason: 'bot-working' | 'delivery-pending' | 'memory' | 'migration'; files: number }[];
}

export interface MediaCleanupResult {
  messages: number;
  files: number;
  freedBytes: number;
  removedFiles: number;
  pendingFiles: number;
}

export class StorageCleanupError extends Error {
  constructor(
    readonly code: 'storage-unavailable' | 'storage-scope-invalid' | 'storage-preview-stale',
    message: string,
  ) {
    super(message);
    this.name = 'StorageCleanupError';
  }
}

export interface StorageCleanup {
  usage(): StorageUsage;
  preview(scope: MediaCleanupScope): MediaCleanupPreview;
  confirm(scope: MediaCleanupScope, token: string): MediaCleanupResult;
}

export function storageMediaKind(mime: string): StorageMediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function treeBytes(root: string): number {
  let total = 0;
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) total += lstatSync(path, { throwIfNoEntry: false })?.size ?? 0;
    }
  };
  walk(root);
  return total;
}

function inside(parent: string, child: string): boolean {
  const local = relative(parent, child);
  return (
    local === '' || (local !== '..' && !local.startsWith('..' + sep) && !local.startsWith(sep))
  );
}

interface PlacementRow {
  channel_id: string;
  source_event_id: string;
  created_at: string;
  payload_json: string;
}

interface PlannedEvent {
  sourceEventId: string;
  channelIds: string[];
  cleared: ChannelAttachmentRef[];
  remaining: ChannelAttachmentRef[];
}

interface Plan {
  scope: CleanupScope;
  events: PlannedEvent[];
  kept: Map<MediaCleanupPreview['kept'][number]['reason'], number>;
  freed: Set<string>;
  fingerprint: string;
}

function resolvedAttachments(db: DatabaseSync, sourceEventId: string, refs: unknown[]) {
  const bindings = db
    .prepare(
      'SELECT attachment_index, state, target_json FROM attachment_file_bindings WHERE source_event_id = ?',
    )
    .all(sourceEventId);
  if (bindings.some((row) => row.state !== 'ready')) return undefined;
  const targets = new Map(
    bindings.map((row) => [Number(row.attachment_index), JSON.parse(String(row.target_json))]),
  );
  const resolved = refs.map((ref, index) => targets.get(index) ?? ref);
  return resolved.every(isChannelAttachmentRef) ? resolved : undefined;
}

export function createStorageCleanup(deps: {
  dshHome: string;
  database: OperationalDatabaseOwner;
  attachments: AttachmentStore;
  channels: {
    list(): ChannelRecord[];
    referencedAttachmentHashes(): ReadonlySet<string>;
  };
  memoryDirs: () => readonly string[];
  memoryReferences: () => Iterable<string>;
  botName?: (slug: string) => string | undefined;
  now?: () => Date;
}): StorageCleanup {
  const now = deps.now ?? (() => new Date());
  const port = attachOperationalModule(deps.database, 'storage');
  const previews = new Map<string, { fingerprint: string; expiresAt: number }>();
  const ready = (): void => {
    if (deps.database.mode !== 'ready')
      throw new StorageCleanupError('storage-unavailable', 'The operational database is not ready');
  };
  const names = (): Map<string, ChannelRecord> =>
    new Map(deps.channels.list().map((record) => [record.id, record]));
  const chatName = (records: Map<string, ChannelRecord>, channelId: string): string => {
    const record = records.get(channelId);
    if (record === undefined) return channelId;
    if (record.type === 'dm' && record.botSlug !== undefined)
      return deps.botName?.(record.botSlug) ?? record.name;
    return record.name;
  };

  const normalize = (scope: MediaCleanupScope): CleanupScope => {
    const requested = new Date(scope.before);
    if (!Number.isFinite(requested.getTime()))
      throw new StorageCleanupError('storage-scope-invalid', '`before` must be a valid time');
    const before = new Date(Math.min(requested.getTime(), now().getTime()));
    const kinds = [...new Set(scope.kinds ?? STORAGE_MEDIA_KINDS)].sort();
    if (kinds.length === 0 || kinds.some((kind) => !STORAGE_MEDIA_KINDS.includes(kind)))
      throw new StorageCleanupError('storage-scope-invalid', 'Unknown media kind');
    const channelIds = [...new Set(scope.channelIds ?? [])].sort();
    return { before: before.toISOString(), channelIds, kinds };
  };

  const plan = (input: MediaCleanupScope): Plan => {
    const scope = normalize(input);
    const memory = new Set(deps.memoryReferences());
    const extra = deps.channels.referencedAttachmentHashes();
    return port.read((db) => {
      const placements = db
        .prepare(
          `SELECT p.channel_id, e.source_event_id, e.created_at, e.payload_json
             FROM channel_placements p JOIN source_events e USING(source_event_id)`,
        )
        .all() as unknown as PlacementRow[];
      const purged = new Set(
        db
          .prepare('SELECT source_event_id FROM messaging_purge_facts')
          .all()
          .map((row) => String(row.source_event_id)),
      );
      const busy = new Set(
        db
          .prepare(
            `SELECT source_event_id FROM inbox_admissions WHERE attempt_state IN (${UNFINISHED_ADMISSIONS.map(() => '?').join(',')})`,
          )
          .all(...UNFINISHED_ADMISSIONS)
          .map((row) => String(row.source_event_id)),
      );
      const outbox = new Set<string>();
      const outboxFiles = new Set<string>();
      for (const row of db.prepare('SELECT state, body FROM messaging_outbox').all()) {
        const intent = JSON.parse(String(row.body));
        if (isChannelAttachmentRef(intent.file)) outboxFiles.add(attachmentIdentity(intent.file));
        if ((row.state === 'pending' || row.state === 'in-flight') && intent.sourceEventId)
          outbox.add(String(intent.sourceEventId));
      }
      const selected = new Set(scope.channelIds);
      const byEvent = new Map<string, { row: PlacementRow; channelIds: string[] }>();
      for (const row of placements) {
        const entry = byEvent.get(row.source_event_id);
        if (entry) entry.channelIds.push(row.channel_id);
        else byEvent.set(row.source_event_id, { row, channelIds: [row.channel_id] });
      }
      const kept = new Map<MediaCleanupPreview['kept'][number]['reason'], number>();
      const keep = (reason: MediaCleanupPreview['kept'][number]['reason'], files: number) =>
        kept.set(reason, (kept.get(reason) ?? 0) + files);
      const events: PlannedEvent[] = [];
      const elsewhere = new Set<string>([...memory, ...outboxFiles]);
      for (const { row, channelIds } of byEvent.values()) {
        const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
        const refs = Array.isArray(payload['attachments']) ? payload['attachments'] : [];
        if (refs.length === 0 || payload['external'] !== undefined) continue;
        const resolved = resolvedAttachments(db, row.source_event_id, refs);
        const inScope =
          row.created_at < scope.before &&
          (selected.size === 0 || channelIds.some((id) => selected.has(id))) &&
          !purged.has(row.source_event_id);
        const wanted = (resolved ?? []).filter((ref) =>
          scope.kinds.includes(storageMediaKind(ref.mime)),
        );
        if (!inScope || resolved === undefined || wanted.length === 0) {
          if (inScope && resolved === undefined) keep('migration', refs.length);
          for (const ref of resolved ?? refs)
            if (isChannelAttachmentRef(ref)) elsewhere.add(attachmentIdentity(ref));
          continue;
        }
        const reason = busy.has(row.source_event_id)
          ? 'bot-working'
          : outbox.has(row.source_event_id)
            ? 'delivery-pending'
            : undefined;
        if (reason !== undefined) {
          keep(reason, wanted.length);
          for (const ref of resolved) elsewhere.add(attachmentIdentity(ref));
          continue;
        }
        const cleared = wanted.filter((ref) => !memory.has(attachmentIdentity(ref)));
        if (cleared.length < wanted.length) keep('memory', wanted.length - cleared.length);
        const remaining = resolved.filter((ref) => !cleared.includes(ref));
        for (const ref of remaining) elsewhere.add(attachmentIdentity(ref));
        if (cleared.length > 0)
          events.push({ sourceEventId: row.source_event_id, channelIds, cleared, remaining });
      }
      for (const row of db.prepare('SELECT file_id FROM messaging_managed_files').all())
        elsewhere.add(String(row.file_id));
      for (const row of db
        .prepare("SELECT file_id FROM attachment_file_bindings WHERE state = 'pending'")
        .all())
        elsewhere.add(String(row.file_id));
      const planned = new Set(
        events.flatMap((event) => event.cleared.map((ref) => attachmentIdentity(ref))),
      );
      for (const id of extra) if (!planned.has(id)) elsewhere.add(id);
      const freed = new Set([...planned].filter((id) => !elsewhere.has(id)));
      events.sort((a, b) => a.sourceEventId.localeCompare(b.sourceEventId));
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify([
            scope,
            events.map((event) => [event.sourceEventId, event.cleared.map(attachmentIdentity)]),
          ]),
        )
        .digest('hex');
      return { scope, events, kept, freed, fingerprint };
    });
  };

  const summarize = (result: Plan) => {
    const records = names();
    const sizes = new Map<string, ChannelAttachmentRef>();
    const kinds = new Map<StorageMediaKind, StorageMediaTotal>();
    const chats = new Map<
      string,
      { channelId: string; name: string; files: number; bytes: number }
    >();
    for (const event of result.events)
      for (const ref of event.cleared) {
        const id = attachmentIdentity(ref);
        const kind = storageMediaKind(ref.mime);
        const total = kinds.get(kind) ?? { kind, count: 0, bytes: 0 };
        total.count += 1;
        total.bytes += ref.size;
        kinds.set(kind, total);
        sizes.set(id, ref);
        for (const channelId of event.channelIds) {
          const chat = chats.get(channelId) ?? {
            channelId,
            name: chatName(records, channelId),
            files: 0,
            bytes: 0,
          };
          chat.files += 1;
          chat.bytes += ref.size;
          chats.set(channelId, chat);
        }
      }
    return {
      messages: result.events.length,
      files: [...kinds.values()].reduce((sum, total) => sum + total.count, 0),
      bytes: [...kinds.values()].reduce((sum, total) => sum + total.bytes, 0),
      freedBytes: [...result.freed].reduce((sum, id) => sum + (sizes.get(id)?.size ?? 0), 0),
      kinds: STORAGE_MEDIA_KINDS.flatMap((kind) => kinds.get(kind) ?? []),
      chats: [...chats.values()].sort((a, b) => b.bytes - a.bytes),
      kept: [...result.kept].map(([reason, files]) => ({ reason, files })),
    };
  };

  return {
    usage() {
      ready();
      const botharness = join(deps.dshHome, 'botharness');
      const media = treeBytes(deps.attachments.rootDir);
      const messages = ['botharness.db', 'botharness.db-wal', 'botharness.db-shm'].reduce(
        (sum, name) =>
          sum + (lstatSync(join(botharness, name), { throwIfNoEntry: false })?.size ?? 0),
        0,
      );
      let memory = 0;
      let memoryOutside = 0;
      for (const dir of new Set(deps.memoryDirs())) {
        const bytes = treeBytes(dir);
        memory += bytes;
        if (!inside(botharness, dir)) memoryOutside += bytes;
      }
      const total = treeBytes(botharness) + memoryOutside;
      const records = names();
      const chats = new Map<string, StorageChatUsage & { ids: Set<string> }>();
      port.read((db) => {
        const rows = db
          .prepare(
            `SELECT p.channel_id, e.source_event_id, e.created_at, e.payload_json
               FROM channel_placements p JOIN source_events e USING(source_event_id)`,
          )
          .all() as unknown as PlacementRow[];
        for (const row of rows) {
          const record = records.get(row.channel_id);
          const chat = chats.get(row.channel_id) ?? {
            channelId: row.channel_id,
            name: chatName(records, row.channel_id),
            type: record?.type ?? 'group',
            ...(record?.deletedAt === undefined ? {} : { deleted: true as const }),
            messages: 0,
            mediaBytes: 0,
            media: [],
            ids: new Set<string>(),
          };
          chat.messages += 1;
          if (chat.oldestAt === undefined || row.created_at < chat.oldestAt)
            chat.oldestAt = row.created_at;
          const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
          const refs = Array.isArray(payload['attachments']) ? payload['attachments'] : [];
          for (const ref of resolvedAttachments(db, row.source_event_id, refs) ?? []) {
            const id = attachmentIdentity(ref);
            if (chat.ids.has(id)) continue;
            chat.ids.add(id);
            const kind = storageMediaKind(ref.mime);
            let total = chat.media.find((item) => item.kind === kind);
            if (total === undefined) {
              total = { kind, count: 0, bytes: 0 };
              chat.media.push(total);
            }
            total.count += 1;
            total.bytes += ref.size;
            chat.mediaBytes += ref.size;
          }
          chats.set(row.channel_id, chat);
        }
      });
      return {
        measuredAt: now().toISOString(),
        totalBytes: total,
        parts: [
          { kind: 'media', bytes: media },
          { kind: 'messages', bytes: messages },
          { kind: 'memory', bytes: memory },
          { kind: 'other', bytes: Math.max(0, total - media - messages - memory) },
        ],
        chats: [...chats.values()]
          .map(({ ids: _ids, media, ...chat }) => ({
            ...chat,
            media: STORAGE_MEDIA_KINDS.flatMap(
              (kind) => media.find((item) => item.kind === kind) ?? [],
            ),
          }))
          .sort((a, b) => b.mediaBytes - a.mediaBytes || b.messages - a.messages),
      };
    },
    preview(scope) {
      ready();
      const result = plan(scope);
      const expiresAt = now().getTime() + PREVIEW_TTL_MS;
      for (const [token, entry] of previews)
        if (entry.expiresAt <= now().getTime()) previews.delete(token);
      const token = randomUUID();
      previews.set(token, { fingerprint: result.fingerprint, expiresAt });
      return {
        token,
        expiresAt: new Date(expiresAt).toISOString(),
        scope: result.scope,
        ...summarize(result),
      };
    },
    confirm(scope, token) {
      ready();
      const entry = previews.get(token);
      const result = plan(scope);
      if (
        entry === undefined ||
        entry.expiresAt <= now().getTime() ||
        entry.fingerprint !== result.fingerprint
      )
        throw new StorageCleanupError(
          'storage-preview-stale',
          'What this cleanup would remove has changed; preview it again',
        );
      previews.delete(token);
      const clearedAt = now().toISOString();
      port.transaction(
        (db) => {
          for (const event of result.events) {
            const row = db
              .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
              .get(event.sourceEventId);
            const payload = JSON.parse(String(row!.payload_json)) as Record<string, unknown>;
            const previous = Array.isArray(payload['clearedAttachments'])
              ? payload['clearedAttachments'].filter(isChannelClearedAttachment)
              : [];
            if (event.remaining.length > 0) payload['attachments'] = event.remaining;
            else delete payload['attachments'];
            payload['clearedAttachments'] = [
              ...previous,
              ...event.cleared.map((ref) => ({
                name: ref.name,
                mime: ref.mime,
                size: ref.size,
                clearedAt,
              })),
            ];
            db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
              JSON.stringify(payload),
              event.sourceEventId,
            );
            db.prepare('DELETE FROM attachment_file_bindings WHERE source_event_id = ?').run(
              event.sourceEventId,
            );
          }
        },
        ['channel'],
      );
      let removedFiles = 0;
      let pendingFiles = 0;
      const references = (): ReadonlySet<string> => {
        const live = new Set([
          ...deps.channels.referencedAttachmentHashes(),
          ...deps.memoryReferences(),
        ]);
        return port.read((db) => {
          for (const row of db.prepare('SELECT file_id FROM messaging_managed_files').all())
            live.add(String(row.file_id));
          for (const row of db.prepare('SELECT body FROM messaging_outbox').all()) {
            const intent = JSON.parse(String(row.body));
            if (isChannelAttachmentRef(intent.file)) live.add(attachmentIdentity(intent.file));
          }
          return live;
        });
      };
      for (const id of result.freed) {
        try {
          if (deps.attachments.purgeReviewed(id, references) === 'removed') removedFiles += 1;
          else pendingFiles += 1;
        } catch {
          pendingFiles += 1;
        }
      }
      const summary = summarize(result);
      return {
        messages: summary.messages,
        files: summary.files,
        freedBytes: summary.freedBytes,
        removedFiles,
        pendingFiles,
      };
    },
  };
}
