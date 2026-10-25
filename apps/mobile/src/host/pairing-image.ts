import { Camera } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';

export type PairingImageResult =
  | { kind: 'cancelled' }
  | { kind: 'link'; link: string }
  | { kind: 'error'; code: 'no-code' | 'multiple-codes' | 'read-failed' };

export async function readPairingImage(signal: AbortSignal): Promise<PairingImageResult> {
  if (signal.aborted) return { kind: 'cancelled' };
  try {
    const selected = await launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (signal.aborted || selected.canceled) return { kind: 'cancelled' };
    const image = selected.assets[0];
    if (!image) return { kind: 'error', code: 'read-failed' };
    const codes = await Camera.scanFromURLAsync(image.uri, ['qr']);
    if (signal.aborted) return { kind: 'cancelled' };
    const links = [...new Set(codes.map((code) => code.data.trim()).filter(Boolean))];
    if (links.length === 0) return { kind: 'error', code: 'no-code' };
    if (links.length !== 1) return { kind: 'error', code: 'multiple-codes' };
    return { kind: 'link', link: links[0]! };
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'error', code: 'read-failed' };
  }
}
