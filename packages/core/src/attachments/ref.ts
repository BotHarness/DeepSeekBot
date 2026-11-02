export const ATTACHMENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
export const ATTACHMENT_FILE_ID_PATTERN =
  /^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface AttachmentMetadata {
  name: string;
  mime: string;
  size: number;
}
export type ChannelAttachmentRef = AttachmentMetadata &
  ({ fileId: string; hash?: never } | { hash: string; fileId?: never });

export function attachmentIdentity(ref: ChannelAttachmentRef): string {
  return ref.fileId ?? ref.hash;
}

export function attachmentIntent(refs: readonly ChannelAttachmentRef[]): unknown[] {
  return refs.map((ref) =>
    ref.fileId === undefined ? ref : { fileId: ref.fileId, name: ref.name },
  );
}

export function isChannelAttachmentRef(value: unknown): value is ChannelAttachmentRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Record<string, unknown>;
  return (
    ((typeof ref['hash'] === 'string' &&
      ATTACHMENT_HASH_PATTERN.test(ref['hash']) &&
      ref['fileId'] === undefined) ||
      (typeof ref['fileId'] === 'string' &&
        ATTACHMENT_FILE_ID_PATTERN.test(ref['fileId']) &&
        ref['hash'] === undefined)) &&
    typeof ref['name'] === 'string' &&
    ref['name'].length > 0 &&
    ref['name'].length <= 180 &&
    !/[/\\\u0000-\u001f\u007f]/u.test(ref['name']) &&
    typeof ref['mime'] === 'string' &&
    /^[a-z][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(ref['mime']) &&
    Number.isSafeInteger(ref['size']) &&
    (ref['size'] as number) >= 0
  );
}

export interface ChannelClearedAttachment {
  name: string;
  mime: string;
  size: number;
  clearedAt: string;
}

export function isChannelClearedAttachment(value: unknown): value is ChannelClearedAttachment {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['name'] === 'string' &&
    item['name'].length > 0 &&
    item['name'].length <= 180 &&
    typeof item['mime'] === 'string' &&
    item['mime'].length <= 200 &&
    Number.isSafeInteger(item['size']) &&
    (item['size'] as number) >= 0 &&
    typeof item['clearedAt'] === 'string'
  );
}
