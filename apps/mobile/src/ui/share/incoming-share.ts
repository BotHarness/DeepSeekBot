import type { ResolvedSharePayload } from 'expo-sharing';

import { fromSharedFile, MAX_PICKED, type PickedFile } from '../../host/pick-files';
import { sourceDrafts } from '../../host/native-source-drafts';

export type IncomingShare = { text: string; files: PickedFile[] };

export function incomingShare(payloads: readonly ResolvedSharePayload[]): IncomingShare {
  const text: string[] = [];
  const files: PickedFile[] = [];
  for (const payload of payloads) {
    const uri = payload.contentUri;
    const attachment =
      uri !== null &&
      payload.shareType !== 'text' &&
      payload.shareType !== 'url' &&
      payload.contentType !== 'website' &&
      payload.contentType !== 'text';
    if (attachment) {
      if (files.length < MAX_PICKED)
        files.push(fromSharedFile(uri, payload.originalName, payload.contentMimeType ?? null));
    } else if (payload.value.trim() !== '') text.push(payload.value.trim());
  }
  return { text: text.join('\n'), files };
}

export function appendShared(current: string, text: string): string {
  if (text === '') return current;
  return current.trim() === '' ? text : `${current.replace(/\s+$/u, '')}\n${text}`;
}

const held = new Map<string, PickedFile[]>();

export function takeSharedFiles(key: string): PickedFile[] {
  const files = held.get(key) ?? [];
  held.delete(key);
  return files;
}

export async function deliverShare(key: string, share: IncomingShare): Promise<void> {
  await sourceDrafts.ready;
  if (share.text !== '') sourceDrafts.set(key, appendShared(sourceDrafts.get(key), share.text));
  if (share.files.length > 0)
    held.set(key, [...(held.get(key) ?? []), ...share.files].slice(0, MAX_PICKED));
}
