export const CREATE_FOLDER_PERMISSION = 'workspaces.createFolder';
const MAX_NAME = 255;

export type NewFolderNameProblem = 'empty' | 'segment' | 'too-long';

export function newFolderNameProblem(name: string): NewFolderNameProblem | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (trimmed === '.' || trimmed.includes('..') || /[\\/\0]/u.test(trimmed)) return 'segment';
  if (trimmed.length > MAX_NAME) return 'too-long';
  return undefined;
}

export type NewFolderRefusal = 'exists' | 'outside-grant' | 'denied' | 'permission' | 'invalid';

const REFUSALS: Record<string, NewFolderRefusal> = {
  'folder-create/already-exists': 'exists',
  'folder-create/outside-grant': 'outside-grant',
  'folder-create/denied': 'denied',
  'permission-required': 'permission',
  'invalid-input': 'invalid',
};

export function newFolderRefusal(error: unknown): NewFolderRefusal | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error;
  return typeof code === 'string' ? REFUSALS[code] : undefined;
}

export function canCreateFolders(
  viewer: { owner: boolean; permissions: readonly string[] } | undefined,
): boolean {
  return (
    viewer !== undefined && (viewer.owner || viewer.permissions.includes(CREATE_FOLDER_PERMISSION))
  );
}
