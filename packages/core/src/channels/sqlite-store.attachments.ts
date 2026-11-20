import {
  createLegacyAttachmentMigration,
  type RetainedAttachmentMessage,
} from '../attachments/legacy-migration.js';
import { projectAttachmentFiles } from '../attachments/message-files.js';
import { ChannelAttachmentError } from '../attachments/store.js';
import {
  attachmentIdentity,
  isChannelAttachmentRef,
  type ChannelAttachmentRef,
} from '../attachments/ref.js';
import type { ChannelMessage } from './channel.js';
import type { ChannelStore } from './store.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { PlacementRow } from './sqlite-store.placements.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelStoreOptions } from './sqlite-store.types.js';
import type { createChannelRecords } from './sqlite-store.records.js';

export function createChannelAttachments({
  database,
  options,
  readRecord,
}: {
  database: OperationalDatabaseModulePort;
  options: SqliteChannelStoreOptions;
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
}) {
  const retainedAttachments = (): RetainedAttachmentMessage[] => {
    const rows = database.read((db) =>
      db.prepare('SELECT source_event_id, payload_json, body FROM source_events').all(),
    ) as Array<{ source_event_id: string; payload_json: string; body: string }>;
    return rows.flatMap((row) => {
      const message = parseMessage(row.payload_json, row.body);
      return message === undefined ? [] : [{ sourceEventId: row.source_event_id, message }];
    });
  };

  const attachmentMigration = createLegacyAttachmentMigration(
    database,
    options.attachments,
    retainedAttachments,
    options.warn,
  );

  const assertAttachmentRefs = (refs: readonly ChannelAttachmentRef[]): void => {
    if (
      refs.length > 10 ||
      refs.some(
        (ref) =>
          !isChannelAttachmentRef(ref) ||
          ref.fileId === undefined ||
          !options.attachments?.has(ref),
      )
    )
      throw new ChannelAttachmentError(
        'Attachment does not belong to this profile or uses an obsolete hash; refresh its owning message',
        'invalid-ref',
      );
  };

  const projectMessageAttachments = (
    sourceEventId: string,
    message: ChannelMessage,
  ): ChannelMessage =>
    projectAttachmentFiles(
      attachmentMigration.project(sourceEventId, message),
      options.attachments,
      options.mediaVersions,
    );

  const methods = {
    assertAttachmentRefs,
    migrateAttachments: (signal, events) => attachmentMigration.migrate(signal, events),
    projectMessageAttachments,
    attachmentReference(channelId, messageId, identity) {
      if (readRecord(channelId) === undefined) return undefined;
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT e.source_event_id, e.payload_json, e.body FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        WHERE p.channel_id = ? AND p.message_id = ?
      `)
          .get(channelId, messageId),
      ) as Pick<PlacementRow, 'source_event_id' | 'payload_json' | 'body'> | undefined;
      if (row === undefined) return undefined;
      const original = parseMessage(row.payload_json, row.body);
      const matches = (original?.attachments ?? []).flatMap((ref, index) => {
        const resolved = attachmentMigration.resolve(row.source_event_id, index, ref);
        return attachmentIdentity(ref) === identity || attachmentIdentity(resolved) === identity
          ? [resolved]
          : [];
      });
      if (new Set(matches.map(attachmentIdentity)).size > 1)
        throw new ChannelAttachmentError(
          'Ambiguous legacy attachment reference; refresh the owning message',
          'invalid-ref',
        );
      return matches[0];
    },
    referencedAttachmentHashes() {
      const hashes = new Set<string>();
      for (const { sourceEventId, message } of retainedAttachments())
        for (const [index, ref] of (message.attachments ?? []).entries())
          hashes.add(attachmentIdentity(attachmentMigration.resolve(sourceEventId, index, ref)));
      for (const id of attachmentMigration.pendingFiles()) hashes.add(id);
      return hashes;
    },
  } satisfies Pick<
    ChannelStore,
    | 'assertAttachmentRefs'
    | 'migrateAttachments'
    | 'projectMessageAttachments'
    | 'attachmentReference'
    | 'referencedAttachmentHashes'
  >;

  return { attachmentMigration, methods };
}
