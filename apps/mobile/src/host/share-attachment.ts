import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { MessageAttachment } from './conversation';
import { cacheMedia, mediaCacheAvailable } from './media-cache';

function folderName(key: string): string {
  return key.replace(/[^a-z0-9-]/giu, '_');
}

function fileName(name: string): string {
  const safe = name.replace(/[/\\\u0000-\u001f\u007f]/gu, '_').trim();
  return safe === '' ? 'attachment' : safe;
}

export async function cachedAttachmentUri(
  attachment: MessageAttachment,
  options: { reuse?: boolean } = {},
): Promise<string> {
  const source = attachment.source;
  if (source === undefined) throw new Error('attachment-unavailable');
  if (attachment.local) return source.uri;
  const versioned = source.cacheKey !== undefined;
  const folder = new Directory(
    Paths.cache,
    'attachments',
    folderName(source.cacheKey ?? attachment.key),
  );
  folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, fileName(attachment.name));
  if ((versioned || options.reuse === true) && target.exists && target.size > 0) return target.uri;
  if (source.read) {
    if (source.cacheKey !== undefined && mediaCacheAvailable()) {
      const cached = await cacheMedia(
        { ...source, cacheKey: source.cacheKey, read: source.read },
        new AbortController().signal,
      );
      if (target.exists) target.delete();
      await new File(cached).copy(target);
      return target.uri;
    }
    const { bytes } = await source.read(new AbortController().signal);
    await target.write(bytes);
    return target.uri;
  }
  const file = await File.downloadFileAsync(source.uri, target, {
    headers: source.headers,
    idempotent: true,
  });
  return file.uri;
}

export function forgetSharedCopies(cacheKeyPrefixes: readonly string[]): void {
  if (cacheKeyPrefixes.length === 0) return;
  try {
    const root = new Directory(Paths.cache, 'attachments');
    if (!root.exists) return;
    const prefixes = cacheKeyPrefixes.map(folderName);
    for (const entry of root.list())
      if (entry instanceof Directory && prefixes.some((prefix) => entry.name.startsWith(prefix)))
        entry.delete();
  } catch {}
}

export async function shareAttachment(
  attachment: MessageAttachment,
  stillAvailable: () => boolean = () => true,
): Promise<void> {
  if (!stillAvailable()) throw new Error('attachment-unavailable');
  if (attachment.source === undefined) throw new Error('attachment-unavailable');
  const uri = await cachedAttachmentUri(attachment);
  if (!stillAvailable()) throw new Error('attachment-unavailable');
  await Sharing.shareAsync(uri, {
    dialogTitle: attachment.name,
    ...(attachment.mime === undefined ? {} : { mimeType: attachment.mime }),
  });
}
