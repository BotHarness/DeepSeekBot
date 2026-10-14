import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { MessageAttachment } from './conversation';

function folderName(key: string): string {
  return key.replace(/[^a-z0-9-]/giu, '_');
}

function fileName(name: string): string {
  const safe = name.replace(/[/\\\u0000-\u001f\u007f]/gu, '_').trim();
  return safe === '' ? 'attachment' : safe;
}

export async function shareAttachment(attachment: MessageAttachment): Promise<void> {
  const source = attachment.source;
  if (source === undefined) throw new Error('attachment-unavailable');
  let uri = source.uri;
  if (!attachment.local) {
    const folder = new Directory(Paths.cache, 'attachments', folderName(attachment.key));
    folder.create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(
      source.uri,
      new File(folder, fileName(attachment.name)),
      { headers: source.headers, idempotent: true },
    );
    uri = file.uri;
  }
  await Sharing.shareAsync(uri, {
    dialogTitle: attachment.name,
    ...(attachment.mime === undefined ? {} : { mimeType: attachment.mime }),
  });
}
