import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
export async function shareFeedbackArchive(bytes: Uint8Array, reportId: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
  const file = new File(Paths.cache, 'message-feedback-' + reportId + '.zip');
  try {
    await file.write(bytes);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  } finally {
    if (file.exists) file.delete();
  }
}
