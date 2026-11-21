import { asRecord, unwrap, type BridgeCall } from '../../bridge-transport.js';
import type { HostFileTarget } from '../../host-file-actions.js';
import type { ChannelAttachmentRef } from '../../store.js';
import type { AttachmentVariant, FilesPage, JournalEntry } from '../../bridge.js';
import { parseJournalEntry } from '../channels/bridge.js';

export function parseChannelAttachment(value: unknown): ChannelAttachmentRef | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const { hash, fileId, name, mime, size } = record;
  if (
    !(
      (typeof hash === 'string' && /^sha256:[0-9a-f]{64}$/u.test(hash) && fileId === undefined) ||
      (typeof fileId === 'string' &&
        /^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          fileId,
        ) &&
        hash === undefined)
    ) ||
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 180 ||
    /[/\\\u0000-\u001f\u007f]/u.test(name) ||
    typeof mime !== 'string' ||
    !/^[a-z][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(mime) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 0
  )
    return undefined;
  if (typeof fileId !== 'string') return { hash: hash as string, name, mime, size };
  const { version, width, height, thumbhash } = record;
  const dimension = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  return {
    fileId,
    name,
    mime,
    size,
    ...(typeof version === 'string' && /^[0-9a-f]{32}$/u.test(version) ? { version } : {}),
    ...(dimension(width) && dimension(height)
      ? { width: width as number, height: height as number }
      : {}),
    ...(typeof thumbhash === 'string' && thumbhash.length <= 100 ? { thumbhash } : {}),
  };
}

export function channelAttachmentUrl(
  ref: ChannelAttachmentRef,
  owner: { channelId: string; messageId: string },
  variant?: AttachmentVariant,
): string {
  if (owner === undefined) throw new Error('Message ownership is required for attachments');
  if (ref.fileId !== undefined) {
    return (
      './api/botharness/attachment?' +
      new URLSearchParams({
        ...owner,
        fileId: ref.fileId,
        ...(ref.version === undefined ? {} : { v: ref.version }),
        ...(ref.version === undefined || variant === undefined ? {} : { variant }),
      })
    );
  }
  return (
    './api/botharness/attachment?' +
    new URLSearchParams({ hash: ref.hash, name: ref.name, ...owner })
  );
}

export async function uploadChannelAttachment(
  file: File,
  signal?: AbortSignal,
  uploadId?: string,
): Promise<ChannelAttachmentRef> {
  const response = await fetch(
    `./api/botharness/attachment/upload?${new URLSearchParams({ name: file.name, ...(uploadId === undefined ? {} : { uploadId }) })}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  const payload = asRecord(await response.json());
  const ref = parseChannelAttachment(payload?.['attachment']);
  if (ref === undefined) throw new Error('Invalid attachment upload response');
  return ref;
}

export async function loadFilesPage(
  call: BridgeCall,
  channelId: string,
  request: { before?: number; limit?: number },
  signal?: AbortSignal,
): Promise<FilesPage> {
  const raw = asRecord(await unwrap(call, 'channelFilesPage', { channelId, ...request }, signal));
  const entries = raw?.['entries'];
  const nextBefore = raw?.['nextBefore'];
  const parsed = Array.isArray(entries) ? entries.map((entry) => parseJournalEntry(entry)) : [];
  if (
    !Array.isArray(entries) ||
    parsed.some((entry) => entry === undefined) ||
    !(nextBefore === undefined || (Number.isSafeInteger(nextBefore) && Number(nextBefore) > 0))
  )
    throw new Error('invalid channelFilesPage response');
  return {
    entries: parsed as JournalEntry[],
    ...(nextBefore === undefined ? {} : { nextBefore: nextBefore as number }),
  };
}

export async function loadMessageAttachmentTarget(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  fileId: string,
): Promise<HostFileTarget> {
  const response = asRecord(
    await unwrap(call, 'messageAttachmentTarget', {
      channelId,
      messageId,
      fileId,
    }),
  );
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    typeof target['relativePath'] !== 'string' ||
    target['kind'] !== 'file'
  )
    throw new Error('Invalid message attachment target');
  return {
    path: target['path'],
    relativePath: target['relativePath'],
    kind: 'file',
  };
}
