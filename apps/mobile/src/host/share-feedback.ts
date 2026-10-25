import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';
export async function shareFeedbackArchive(bytes: Uint8Array): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
  const file = new File(Paths.cache, 'feedback-' + randomUUID() + '.zip');
  try {
    await file.write(bytes);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  } finally {
    if (file.exists) file.delete();
  }
}
