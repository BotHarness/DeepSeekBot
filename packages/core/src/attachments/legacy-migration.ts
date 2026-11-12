import { createHash, randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelMessage } from '../channels/channel.js';
import { isChannelAttachmentRef, type ChannelAttachmentRef } from './ref.js';
import { ChannelAttachmentError, type AttachmentStore } from './store.js';
import type { DiagnosticEvents } from '../diagnostics/diagnostic-log.js';

export interface RetainedAttachmentMessage {
  sourceEventId: string;
  message: ChannelMessage;
}

interface Binding {
  file_id: string;
  original_json: string;
  target_json: string | null;
  state: 'pending' | 'ready';
}

export interface AttachmentMigrationResult {
  converted: number;
  failed: number;
  resumed: number;
}

export function createLegacyAttachmentMigration(
  database: OperationalDatabaseModulePort,
  files: AttachmentStore | undefined,
  retained: () => RetainedAttachmentMessage[],
  warn?: (message: string) => void,
) {
  let running: Promise<AttachmentMigrationResult> | undefined;
  const binding = (sourceEventId: string, index: number): Binding | undefined =>
    database.read((db) =>
      db
        .prepare(
          'SELECT file_id, original_json, target_json, state FROM attachment_file_bindings WHERE source_event_id = ? AND attachment_index = ?',
        )
        .get(sourceEventId, index),
    ) as Binding | undefined;
  const resolve = (
    sourceEventId: string,
    index: number,
    ref: ChannelAttachmentRef,
  ): ChannelAttachmentRef => {
    if (ref.fileId !== undefined) return ref;
    const row = binding(sourceEventId, index);
    if (row === undefined || row.state !== 'ready') return ref;
    if (row.original_json !== JSON.stringify(ref))
      throw new ChannelAttachmentError(
        'Attachment migration reference changed; repair required',
        'invalid-ref',
      );
    let value: unknown;
    try {
      value = JSON.parse(row.target_json ?? 'null');
    } catch {}
    if (!isChannelAttachmentRef(value) || value.fileId !== row.file_id)
      throw new ChannelAttachmentError(
        'Attachment migration record is unavailable; repair required',
        'not-found',
      );
    return value;
  };
  const run = async (
    signal?: AbortSignal,
    events?: DiagnosticEvents,
  ): Promise<AttachmentMigrationResult> => {
    const result = { converted: 0, failed: 0, resumed: 0 };
    const start = Date.now();
    const attemptId = randomUUID();
    let stage = 'read-retained';
    let total: number | undefined;
    let processed = 0;
    let causes = 0;
    const record = (
      phase: string,
      fields: Record<string, string | number | boolean | undefined> = {},
    ) => {
      try {
        events?.record('attachment-migration', phase, {
          attemptId,
          initiator: 'host-startup',
          stage,
          durationMs: Date.now() - start,
          total,
          processed,
          remaining: total === undefined ? undefined : total - processed,
          ...result,
          ...fields,
        });
      } catch {}
    };
    const failure = (error: unknown) => {
      if (causes++ >= 8) return;
      try {
        const codes: string[] = [];
        let cause = error;
        for (let depth = 0; depth < 3 && cause instanceof Error; depth++) {
          if (cause instanceof ChannelAttachmentError) codes.push(cause.code);
          else if (
            'code' in cause &&
            typeof cause.code === 'string' &&
            [
              'ENOENT',
              'EACCES',
              'EPERM',
              'ENOSPC',
              'EIO',
              'EROFS',
              'EBUSY',
              'EMFILE',
              'ENFILE',
              'SQLITE_BUSY',
              'SQLITE_LOCKED',
              'SQLITE_READONLY',
              'SQLITE_FULL',
              'SQLITE_IOERR',
              'ERR_SQLITE_ERROR',
            ].includes(cause.code)
          )
            codes.push(cause.code);
          else codes.push(cause instanceof TypeError ? 'type-error' : 'unclassified-error');
          cause = cause.cause;
        }
        record('failure-cause', {
          code: codes[0] ?? 'unclassified-error',
          causeCodes: codes.join(' > '),
          causeIndex: causes - 1,
        });
      } catch {
        record('failure-cause', { code: 'unclassified-error', causeIndex: causes - 1 });
      }
    };
    record('started');
    try {
      if (files === undefined) return result;
      let announced = false;
      const messages = retained();
      total = messages.reduce(
        (count, { message }) =>
          count + (message.attachments ?? []).filter((ref) => ref.hash !== undefined).length,
        0,
      );
      record('progress');
      for (const { sourceEventId, message } of messages) {
        for (const [index, ref] of (message.attachments ?? []).entries()) {
          if (signal?.aborted) return result;
          if (ref.hash === undefined) continue;
          stage = 'reserve';
          let row = binding(sourceEventId, index);
          if (row?.state === 'ready') {
            processed += 1;
            continue;
          }
          if (!announced) {
            warn?.('attachment-migration phase=started initiator=Host-startup');
            announced = true;
          }
          if (row === undefined) {
            const id = 'file:' + randomUUID();
            database.transaction(
              (db) =>
                db
                  .prepare(`
            INSERT INTO attachment_file_bindings
              (source_event_id, attachment_index, file_id, original_json, state)
            VALUES (?, ?, ?, ?, 'pending')
          `)
                  .run(sourceEventId, index, id, JSON.stringify(ref)),
              [],
            );
            row = binding(sourceEventId, index)!;
          } else result.resumed += 1;
          try {
            if (row.original_json !== JSON.stringify(ref))
              throw new ChannelAttachmentError('Legacy reference changed', 'invalid-ref');
            stage = 'download';
            const source = await files.download(ref.hash, ref.name, signal);
            if (source.ref.size !== ref.size || source.ref.mime !== ref.mime) {
              await source.body.cancel();
              throw new ChannelAttachmentError(
                'Legacy metadata does not match current object',
                'corrupt',
              );
            }
            const data = async function* () {
              const reader = source.body.getReader();
              try {
                while (true) {
                  const next = await reader.read();
                  if (next.done) break;
                  yield next.value;
                }
              } finally {
                await reader.cancel().catch(() => undefined);
                reader.releaseLock();
              }
            };
            stage = 'upload';
            const target = await files
              .upload({
                data: data(),
                name: ref.name,
                uploadId: row.file_id.slice(5),
                ...(signal === undefined ? {} : { signal }),
              })
              .finally(async () => {
                if (!source.body.locked) await source.body.cancel().catch(() => undefined);
              });
            if (target.fileId !== row.file_id)
              throw new ChannelAttachmentError(
                'Converted attachment identity changed',
                'invalid-ref',
              );
            stage = 'verify';
            const check = await files.download(row.file_id, undefined, signal);
            const reader = check.body.getReader();
            const checksum = createHash('sha256');
            let size = 0;
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) break;
                checksum.update(next.value);
                size += next.value.byteLength;
                if (size > ref.size)
                  throw new ChannelAttachmentError(
                    'Converted attachment grew before publication',
                    'corrupt',
                  );
              }
            } finally {
              await reader.cancel().catch(() => undefined);
              reader.releaseLock();
            }
            if (
              size !== ref.size ||
              check.ref.mime !== ref.mime ||
              'sha256:' + checksum.digest('hex') !== ref.hash
            )
              throw new ChannelAttachmentError(
                'Converted attachment failed verification',
                'corrupt',
              );
            signal?.throwIfAborted();
            stage = 'activate';
            database.transaction(
              (db) =>
                db
                  .prepare(`
            UPDATE attachment_file_bindings SET state = 'ready', target_json = ?, last_error = NULL
            WHERE source_event_id = ? AND attachment_index = ? AND file_id = ?
          `)
                  .run(JSON.stringify(target), sourceEventId, index, row.file_id),
              [],
            );
            result.converted += 1;
            processed += 1;
          } catch (error) {
            if (signal?.aborted) return result;
            failure(error);
            stage = 'record-failure';
            const code = error instanceof ChannelAttachmentError ? error.code : 'conversion-failed';
            database.transaction(
              (db) =>
                db
                  .prepare(`
            UPDATE attachment_file_bindings SET last_error = ? WHERE source_event_id = ? AND attachment_index = ?
          `)
                  .run(code, sourceEventId, index),
              [],
            );
            result.failed += 1;
            processed += 1;
            warn?.(
              `attachment-migration phase=refused source=${encodeURIComponent(sourceEventId).slice(0, 80)} index=${index} code=${code} action=repair-legacy-object-and-restart`,
            );
          }
          if (processed % Math.max(1, Math.ceil(total / 16)) === 0) record('progress');
        }
      }
      if (announced)
        warn?.(
          `attachment-migration phase=complete converted=${result.converted} failed=${result.failed} resumed=${result.resumed} durationMs=${Date.now() - start}`,
        );
      return result;
    } catch (error) {
      if (!signal?.aborted) failure(error);
      throw error;
    } finally {
      record(
        signal?.aborted ? 'cancelled' : causes > 0 || result.failed > 0 ? 'failed' : 'completed',
        {
          reason: signal?.aborted ? 'caller-aborted' : undefined,
          omittedCauses: Math.max(0, causes - 8),
        },
      );
    }
  };
  return {
    resolve,
    project(sourceEventId: string, message: ChannelMessage): ChannelMessage {
      if (!message.attachments?.some((ref) => ref.hash !== undefined)) return message;
      return {
        ...message,
        attachments: message.attachments.map((ref, index) => resolve(sourceEventId, index, ref)),
      };
    },
    pendingFiles(): string[] {
      return database
        .read((db) =>
          db.prepare("SELECT file_id FROM attachment_file_bindings WHERE state = 'pending'").all(),
        )
        .map((row) => String(row.file_id));
    },
    migrate(signal?: AbortSignal, events?: DiagnosticEvents): Promise<AttachmentMigrationResult> {
      if (running !== undefined) return running;
      const operation = run(signal, events);
      running = operation;
      void operation
        .finally(() => {
          if (running === operation) running = undefined;
        })
        .catch(() => undefined);
      return operation;
    },
  };
}
