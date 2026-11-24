import { File, Paths } from 'expo-file-system';
import type { PickedFolder } from '../../ui/chat/folder-picker-sheet';

const file = () => new File(Paths.document, 'deepseekbot-session-folders.json');
let folders: Record<string, PickedFolder> | undefined;

function load(): Record<string, PickedFolder> {
  if (folders !== undefined) return folders;
  try {
    const stored = file();
    const value: unknown = stored.exists ? JSON.parse(stored.textSync()) : undefined;
    folders =
      typeof value === 'object' && value !== null ? (value as Record<string, PickedFolder>) : {};
  } catch {
    folders = {};
  }
  return folders;
}

export function lastSessionFolder(hostId: string): PickedFolder | undefined {
  const folder = load()[hostId];
  return typeof folder?.path === 'string' && typeof folder.title === 'string' ? folder : undefined;
}

export function rememberSessionFolder(hostId: string, folder: PickedFolder): void {
  folders = { ...load(), [hostId]: folder };
  try {
    file().writeSync(JSON.stringify(folders));
  } catch {}
}
