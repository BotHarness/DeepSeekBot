import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { AttachmentStore } from '../attachments/store.js';
import { ChannelAttachmentError } from '../attachments/store.js';
import type { ExternalSource } from './inbound.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingProvider } from './provider.js';
import { readMessagingIdentity } from './identity.js';
import { bridgeChannel, humanBridgeChannel } from './channel-target.js';
import { channelBridgeRoutes } from './channel-bridge.js';
import { sourceMediaUploadId } from './media-identity.js';

interface MediaRequest {
  channelId: string;
  sourceEventId: string;
  attachmentId: string;
  representation?: 'playback';
  signal: AbortSignal;
}

function authority(db: DatabaseSync, input: MediaRequest, active: (slug: string) => boolean) {
  humanBridgeChannel(db, input.channelId);
  const row = db
    .prepare(`SELECT e.payload_json FROM source_events e
    JOIN channel_placements p USING(source_event_id)
    WHERE p.channel_id = ? AND e.source_event_id = ? AND e.source_kind = 'bridge-message'`)
    .get(input.channelId, input.sourceEventId) as { payload_json: string } | undefined;
  const source = row && (JSON.parse(row.payload_json) as { external?: ExternalSource }).external;
  const attachment = source?.event.attachments?.find((item) => item.id === input.attachmentId);
  if (
    !source ||
    !attachment ||
    !(
      attachment.mediaType?.startsWith('image/') ||
      (source.platform === 'qq' &&
        (attachment.mediaType === 'application/octet-stream' ||
          (source.event.voice && attachment.mediaType === 'audio/unknown')))
    )
  )
    throw new MessagingError('source-unavailable');
  const rows = db
    .prepare(`SELECT g.body, p.route_id FROM messaging_source_paths p
    JOIN messaging_grants g ON g.id = p.grant_id
    WHERE p.channel_id = ? AND p.source_event_id = ? ORDER BY g.id, p.route_id`)
    .all(input.channelId, input.sourceEventId) as { body: string; route_id: string }[];
  if (!rows.length) {
    const row = db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(source.grantId) as
      | { body: string }
      | undefined;
    const grant = row && (JSON.parse(row.body) as MessagingGrant);
    if (row && grant?.origin === 'implicit') {
      for (const route of channelBridgeRoutes(grant)) {
        if (route.channelId === input.channelId) rows.push({ body: row.body, route_id: route.id });
      }
    }
  }
  const candidates = rows.flatMap((row) => {
    const grant = JSON.parse(row.body) as MessagingGrant;
    const route = channelBridgeRoutes(grant).find((item) => item.id === row.route_id);
    if (
      !route ||
      route.channelId !== input.channelId ||
      grant.revokedAt ||
      grant.suspendedReason ||
      !grant.receiveScope ||
      grant.receiveScope.conversationId !== source.event.conversation.id ||
      grant.receiveScope.kind !== source.event.conversation.kind ||
      grant.fingerprint !== source.event.fingerprint ||
      grant.accountRef !== source.event.botId ||
      grant.platform !== source.event.channel ||
      !active(grant.botSlug)
    )
      return [];
    try {
      bridgeChannel(db, input.channelId, grant.botSlug);
      const identity = readMessagingIdentity(db, grant.bindingId);
      if (
        identity.revokedAt ||
        !identity.enabled ||
        identity.providerId !== grant.providerId ||
        identity.accountRef !== grant.accountRef ||
        identity.fingerprint !== grant.fingerprint
      )
        return [];
    } catch (error) {
      if (!(error instanceof MessagingError)) throw error;
      return [];
    }
    return [{ grant, enabled: route.enabled }];
  });
  if (!candidates.length) throw new MessagingError('source-unavailable');
  return { source, attachment, candidates };
}

export function createChannelMediaAccess(options: {
  database: OperationalDatabaseModulePort;
  attachments: AttachmentStore;
  active(slug: string): boolean;
  provider(id: string): { provider: MessagingProvider; assertCurrent(): void };
  prepareAudio?(
    botSlug: string,
    sourceEventId: string,
    attachmentId: string,
    signal: AbortSignal,
  ): Promise<import('../attachments/ref.js').ChannelAttachmentRef>;
  warn?: (message: string) => void;
}) {
  let active = 0;
  const queue: (() => void)[] = [];
  const limited = async <T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> => {
    if (active >= 3)
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener('abort', cancel);
          active++;
          resolve();
        };
        const cancel = () => {
          const index = queue.indexOf(ready);
          if (index >= 0) queue.splice(index, 1);
          reject(signal.reason);
        };
        queue.push(ready);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
    else active++;
    try {
      signal.throwIfAborted();
      return await run();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
  return async (input: MediaRequest) => {
    const controller = new AbortController();
    const signal = AbortSignal.any([input.signal, controller.signal, AbortSignal.timeout(30_000)]);
    const current = () => {
      signal.throwIfAborted();
      return options.database.read((db) => authority(db, input, options.active));
    };
    const initial = current();
    const candidate = initial.candidates.find((item) => item.enabled) ?? initial.candidates[0]!;
    const value = candidate.grant;
    const uploadId = sourceMediaUploadId(
      value.providerId,
      value.fingerprint,
      initial.source.event.conversation.id,
      initial.attachment.id,
    );
    let ref = options.attachments.acquired(uploadId);
    let acquiring = ref === undefined;
    if (acquiring && (initial.attachment.sizeBytes ?? 0) > options.attachments.maxBytes)
      throw new ChannelAttachmentError('Attachment exceeds limit', 'too-large');
    const entry = options.provider(value.providerId);
    const validate = () => {
      entry.assertCurrent();
      const latest = current();
      if (
        !latest.candidates.some(
          (item) => item.grant.id === value.id && (!acquiring || item.enabled),
        )
      )
        throw new MessagingError('source-unavailable');
    };
    validate();
    const inspect = entry.provider.inspectAccount
      ? entry.provider.inspectAccount(value.accountRef)
      : entry.provider
          .accounts()
          .then((accounts) =>
            accounts.find((item) => item.ref === value.accountRef && !item.unsupported),
          );
    const account = await abortable(inspect, signal);
    validate();
    if (
      !account ||
      account.ref !== value.accountRef ||
      account.fingerprint !== value.fingerprint ||
      account.platform !== value.platform ||
      (acquiring && !account.connected)
    )
      throw new MessagingError('rebind-required');
    const timer = setInterval(() => {
      try {
        validate();
      } catch (error) {
        controller.abort(error);
      }
    }, 100);
    timer.unref();
    const startedAt = Date.now();
    const cleanup = () => {
      clearInterval(timer);
      signal.removeEventListener('abort', abort);
    };
    const log = (phase: string) =>
      options.warn?.(
        JSON.stringify({
          event: 'messaging-media',
          phase,
          initiator: 'human-channel',
          sourceEventId: input.sourceEventId,
          durationMs: Date.now() - startedAt,
        }),
      );
    log('starting');
    const abort = () => cleanup();
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (ref === undefined) {
        if (!entry.provider.readFile) throw new MessagingError('capability-unavailable');
        ref = await limited(signal, () =>
          options.attachments.acquire({
            uploadId,
            name: initial.attachment.name,
            signal,
            load: async () => {
              validate();
              const chunks = await entry.provider.readFile!({
                accountRef: value.accountRef,
                fingerprint: value.fingerprint,
                route: initial.source.event.reply,
                attachment: initial.attachment,
                signal,
              });
              return (async function* () {
                for await (const chunk of chunks) {
                  validate();
                  yield chunk;
                }
                validate();
              })();
            },
          }),
        );
      }
      validate();
      if (input.representation === 'playback') {
        if (
          !initial.source.event.voice ||
          initial.attachment.mediaType !== 'audio/unknown' ||
          !options.prepareAudio
        )
          throw new MessagingError('audio-codec-unsupported');
        ref = await limited(signal, () =>
          options.prepareAudio!(value.botSlug, input.sourceEventId, input.attachmentId, signal),
        );
        validate();
      }
      acquiring = false;
      options.database.transaction((db) =>
        db
          .prepare('INSERT OR IGNORE INTO messaging_managed_files VALUES (?, ?, ?)')
          .run(input.sourceEventId, ref!.fileId!, 'original'),
      );
      const downloaded = await options.attachments.download(ref.fileId!, ref.name, signal);
      if (downloaded.ref.size > options.attachments.maxBytes) {
        await downloaded.body.cancel();
        throw new ChannelAttachmentError('Attachment exceeds limit', 'too-large');
      }
      if (
        initial.attachment.mediaType?.startsWith('image/') &&
        !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(downloaded.ref.mime)
      ) {
        await downloaded.body.cancel();
        throw new MessagingError('media-format-unsupported');
      }
      const reader = downloaded.body.getReader();
      let servedBytes = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(target) {
          try {
            validate();
            const next = await reader.read();
            validate();
            if (next.done) {
              cleanup();
              reader.releaseLock();
              target.close();
              log('completed');
            } else {
              servedBytes += next.value.byteLength;
              if (servedBytes > options.attachments.maxBytes)
                throw new ChannelAttachmentError('Attachment exceeds limit', 'too-large');
              target.enqueue(next.value);
            }
          } catch (error) {
            cleanup();
            await reader.cancel(error).catch(() => undefined);
            reader.releaseLock();
            target.error(error);
            log('refused');
          }
        },
        async cancel(reason) {
          controller.abort(reason);
          cleanup();
          await reader.cancel(reason).catch(() => undefined);
          reader.releaseLock();
          log('cancelled');
        },
      });
      return {
        ref: downloaded.ref,
        body,
        inline:
          input.representation === 'playback' ||
          initial.attachment.mediaType?.startsWith('image/') === true,
      };
    } catch (error) {
      cleanup();
      controller.abort(error);
      log('refused');
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'artifact-too-large'
      )
        throw new ChannelAttachmentError('Attachment exceeds limit', 'too-large');
      throw error;
    }
  };
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
