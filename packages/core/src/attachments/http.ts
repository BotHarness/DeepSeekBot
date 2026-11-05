import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';

import { MessagingError } from '../messaging/provider.js';
import type { ChannelAttachmentRef } from './ref.js';
import { createMessageAttachmentFiles } from './message-files.js';
import type { MediaVersions } from './media-versions.js';
import { parseThumbnailVariant, THUMBNAIL_MIME } from './thumbnails.js';
import type { ChannelStore } from '../channels/store.js';
import { ChannelAttachmentError, safeAttachmentName, type AttachmentStore } from './store.js';

export const CHANNEL_ATTACHMENT_PATH = '/api/botharness/attachment';

function parseRange(
  header: string | null,
): { start?: number; end?: number } | 'invalid' | undefined {
  if (header === null) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (match === null || (match[1] === '' && match[2] === '')) return 'invalid';
  return {
    ...(match[1] === '' ? {} : { start: Number(match[1]) }),
    ...(match[2] === '' ? {} : { end: Number(match[2]) }),
  };
}

function clampRange(
  range: { start?: number; end?: number },
  size: number,
): { start: number; end: number } | undefined {
  if (size === 0) return undefined;
  if (range.start === undefined) {
    const suffix = Math.min(range.end ?? 0, size);
    return suffix === 0 ? undefined : { start: size - suffix, end: size - 1 };
  }
  if (range.start >= size) return undefined;
  const end = Math.min(range.end ?? size - 1, size - 1);
  return end < range.start ? undefined : { start: range.start, end };
}

const IMMUTABLE = { 'cache-control': 'private, max-age=31536000, immutable' };
export const CHANNEL_ATTACHMENT_UPLOAD_PATH = '/api/botharness/attachment/upload';

async function* chunks(body: ReadableStream<Uint8Array> | null): AsyncIterable<Uint8Array> {
  if (body === null) return;
  const reader = body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function filenameDisposition(name: string, inline: boolean): string {
  const safe = safeAttachmentName(name);
  const ascii = safe.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/gu, (char) => '%' + char.charCodeAt(0).toString(16))}`;
}

function errorResponse(error: unknown): Response {
  if (
    error instanceof MessagingError &&
    [
      'audio-codec-unsupported',
      'audio-decode-failed',
      'audio-decode-timeout',
      'audio-too-large',
    ].includes(error.code)
  )
    return Response.json(
      {
        error: {
          code: error.code,
          message: 'Audio playback is unavailable; the original can still be downloaded.',
        },
      },
      {
        status: error.code === 'audio-too-large' ? 413 : 422,
        headers: { 'cache-control': 'no-store' },
      },
    );
  if (error instanceof MessagingError && error.code === 'media-format-unsupported')
    return Response.json(
      { error: { code: error.code, message: 'Media format cannot be previewed' } },
      { status: 422, headers: { 'cache-control': 'no-store' } },
    );
  if (error instanceof MessagingError)
    return Response.json(
      { error: { code: 'source-unavailable', message: 'Attachment source is unavailable' } },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  if (error instanceof ChannelAttachmentError) {
    const status = error.code === 'too-large' ? 413 : error.code === 'not-found' ? 404 : 400;
    return Response.json(
      { error: { code: error.code, message: error.message } },
      {
        status,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }
  throw error;
}

export function createAttachmentHttp(
  store: AttachmentStore,
  channels?: ChannelStore,
  externalFile?: (input: {
    slug: string;
    sourceEventId: string;
    attachmentId: string;
    representation?: 'playback';
    signal: AbortSignal;
  }) => Promise<{ ref: ChannelAttachmentRef; body: ReadableStream<Uint8Array> }>,
  channelMedia?: (input: {
    channelId: string;
    sourceEventId: string;
    attachmentId: string;
    representation?: 'playback';
    signal: AbortSignal;
  }) => Promise<{ ref: ChannelAttachmentRef; body: ReadableStream<Uint8Array>; inline?: boolean }>,
  mediaVersions?: MediaVersions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (request.method === 'POST') {
      if (
        request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
        'application/octet-stream'
      )
        return new Response('content type must be application/octet-stream', { status: 415 });
      const declared = request.headers.get('content-length');
      if (declared !== null && Number(declared) > store.maxBytes)
        return new Response('attachment exceeds upload limit', { status: 413 });
      try {
        const ref = await store.upload({
          data: chunks(request.body),
          ...(url.searchParams.has('name') ? { name: url.searchParams.get('name') ?? '' } : {}),
          signal: request.signal,
          ...(url.searchParams.has('uploadId')
            ? { uploadId: url.searchParams.get('uploadId') ?? '' }
            : {}),
        });
        if (mediaVersions !== undefined && ref.fileId !== undefined)
          await mediaVersions.ensure(ref.fileId).catch(() => undefined);
        return Response.json(
          { attachment: ref },
          {
            headers: { 'cache-control': 'no-store' },
          },
        );
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (
      request.method === 'GET' &&
      url.searchParams.has('sourceEventId') &&
      url.searchParams.has('channelId')
    ) {
      const channelId = url.searchParams.get('channelId');
      const sourceEventId = url.searchParams.get('sourceEventId');
      const attachmentId = url.searchParams.get('attachmentId');
      if (
        !channelId ||
        !sourceEventId ||
        !attachmentId ||
        !channelMedia ||
        (url.searchParams.has('representation') &&
          url.searchParams.get('representation') !== 'playback') ||
        [...url.searchParams.keys()].some(
          (key) => !['channelId', 'sourceEventId', 'attachmentId', 'representation'].includes(key),
        )
      )
        return new Response('Channel media source is required', { status: 400 });
      try {
        const { ref, body, inline } = await channelMedia({
          channelId,
          sourceEventId,
          attachmentId,
          ...(url.searchParams.has('representation')
            ? { representation: 'playback' as const }
            : {}),
          signal: request.signal,
        });
        return new Response(body, {
          headers: {
            'content-type': ref.mime,
            'content-length': String(ref.size),
            'content-disposition': filenameDisposition(ref.name, inline === true),
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-store',
          },
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (request.method === 'GET' && url.searchParams.has('sourceEventId')) {
      const slug = url.searchParams.get('slug');
      const sourceEventId = url.searchParams.get('sourceEventId');
      const attachmentId = url.searchParams.get('attachmentId');
      if (
        !slug ||
        !sourceEventId ||
        !attachmentId ||
        externalFile === undefined ||
        (url.searchParams.has('representation') &&
          url.searchParams.get('representation') !== 'playback') ||
        [...url.searchParams.keys()].some(
          (key) => !['slug', 'sourceEventId', 'attachmentId', 'representation'].includes(key),
        )
      )
        return new Response('External attachment source is required', { status: 400 });
      try {
        const { ref, body } = await externalFile({
          slug,
          sourceEventId,
          attachmentId,
          ...(url.searchParams.get('representation') === 'playback'
            ? { representation: 'playback' }
            : {}),
          signal: request.signal,
        });
        return new Response(body, {
          headers: {
            'content-type': ref.mime,
            'content-length': String(ref.size),
            'content-disposition': filenameDisposition(ref.name, false),
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-store',
          },
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (request.method === 'GET') {
      const hash = url.searchParams.get('hash');
      const fileId = url.searchParams.get('fileId');
      const channelId = url.searchParams.get('channelId');
      const messageId = url.searchParams.get('messageId');
      if (
        fileId !== null &&
        (hash !== null || channelId === null || messageId === null || channels === undefined)
      )
        return new Response('message ownership is required', { status: 400 });
      if (fileId === null && (hash === null || !hash.startsWith('sha256:')))
        return new Response('legacy hash or message attachment is required', { status: 400 });
      if (hash !== null && channels !== undefined && (channelId === null || messageId === null))
        return new Response(
          'Legacy attachment requires its owning message; refresh the message for fileId',
          { status: 400, headers: { 'cache-control': 'no-store' } },
        );
      const version = url.searchParams.get('v');
      const variantParam = url.searchParams.get('variant');
      if (
        (version !== null || variantParam !== null) &&
        fileId !== null &&
        channels !== undefined &&
        channelId !== null &&
        messageId !== null
      ) {
        if (mediaVersions === undefined || version === null)
          return new Response('versioned media is unavailable', {
            status: 400,
            headers: { 'cache-control': 'no-store' },
          });
        const variant = variantParam === null ? undefined : parseThumbnailVariant(variantParam);
        if (variantParam !== null && variant === undefined)
          return new Response('unknown thumbnail variant', {
            status: 400,
            headers: { 'cache-control': 'no-store' },
          });
        const files = createMessageAttachmentFiles(channels, store);
        try {
          files.target(channelId, messageId, fileId);
        } catch (error) {
          return errorResponse(error);
        }
        const etag = `"${version}-${variant ?? 'original'}"`;
        const stale = async () =>
          Response.json(
            { error: 'stale-version', version: (await mediaVersions.ensure(fileId))?.version },
            { status: 409, headers: { 'cache-control': 'no-store' } },
          );
        if (variant !== undefined) {
          const thumbnail = await mediaVersions.thumbnail(fileId, version, variant);
          if (thumbnail === 'stale') return stale();
          if (thumbnail === 'unavailable')
            return new Response('thumbnail unavailable', {
              status: 422,
              headers: { 'cache-control': 'no-store' },
            });
          if (request.headers.get('if-none-match') === etag)
            return new Response(null, { status: 304, headers: { etag, ...IMMUTABLE } });
          return new Response(new Uint8Array(thumbnail.bytes), {
            headers: {
              'content-type': THUMBNAIL_MIME,
              'content-length': String(thumbnail.bytes.length),
              'x-content-type-options': 'nosniff',
              etag,
              ...IMMUTABLE,
            },
          });
        }
        if ((await mediaVersions.ensure(fileId))?.version !== version) return stale();
        if (request.headers.get('if-none-match') === etag)
          return new Response(null, { status: 304, headers: { etag, ...IMMUTABLE } });
        try {
          const ifRange = request.headers.get('if-range');
          const range =
            ifRange !== null && ifRange !== etag
              ? undefined
              : parseRange(request.headers.get('range'));
          if (range !== undefined) {
            const { path } = files.target(channelId, messageId, fileId);
            const size = statSync(path).size;
            const slice = range === 'invalid' ? undefined : clampRange(range, size);
            if (slice === undefined)
              return new Response(null, {
                status: 416,
                headers: { 'content-range': `bytes */${size}`, 'cache-control': 'no-store' },
              });
            const ref = store.current({ fileId, name: '', mime: '', size: 0 });
            const stream = createReadStream(path, {
              start: slice.start,
              end: slice.end,
              signal: request.signal,
            });
            return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
              status: 206,
              headers: {
                'content-type': ref.mime,
                'content-length': String(slice.end - slice.start + 1),
                'content-range': `bytes ${slice.start}-${slice.end}/${size}`,
                'accept-ranges': 'bytes',
                'x-content-type-options': 'nosniff',
                etag,
                ...IMMUTABLE,
              },
            });
          }
          const { ref, body } = await files.download(channelId, messageId, fileId, request.signal);
          const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ref.mime);
          return new Response(body, {
            headers: {
              'content-type': ref.mime,
              'content-length': String(ref.size),
              'content-disposition': filenameDisposition(ref.name, image),
              'accept-ranges': 'bytes',
              'x-content-type-options': 'nosniff',
              etag,
              ...IMMUTABLE,
            },
          });
        } catch (error) {
          return errorResponse(error);
        }
      }
      try {
        const { ref, body } =
          channels === undefined || channelId === null || messageId === null
            ? await store.download(hash!, url.searchParams.get('name') ?? undefined, request.signal)
            : await createMessageAttachmentFiles(channels!, store).download(
                channelId!,
                messageId!,
                fileId ?? hash!,
                request.signal,
              );
        const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ref.mime);
        return new Response(body, {
          headers: {
            'content-type': ref.mime,
            'content-length': String(ref.size),
            'content-disposition': filenameDisposition(ref.name, image),
            'x-content-type-options': 'nosniff',
            'cache-control': channels === undefined ? 'private, max-age=3600' : 'no-store',
          },
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  };
}
