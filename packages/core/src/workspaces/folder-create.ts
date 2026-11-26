import { lstatSync, mkdirSync, realpathSync, rmdirSync, statSync, type Stats } from 'node:fs';
import { isAbsolute, join, parse, relative } from 'node:path';
import { z } from 'zod';
import { invalidInput, type BridgeResult } from '../kernel/method-utils.js';
import type { HumanContext } from '../humans/context.js';
import type { TeamService } from '../team/service.js';
import { canonicalPath } from './space-paths.js';
import { WorkspaceGrantError } from './grants.js';

const windows = process.platform === 'win32';
const inputSchema = z
  .object({ parent: z.string().min(1).max(1024), name: z.string().min(1).max(255) })
  .strict();
const permission = 'workspaces.createFolder';

export interface CreatedFolderWorkspace {
  id: string;
  path: string;
  title: string;
}

export type RegisterFolderWorkspace = (path: string) => Promise<CreatedFolderWorkspace>;

function refused(code: string, message: string): BridgeResult<never> {
  return { ok: false, error: { code, message } };
}

function filesystemRefusal(error: unknown): BridgeResult<never> {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'EEXIST':
      return refused('folder-create/already-exists', 'That name is already in use.');
    case 'ENOENT':
      return refused('folder-create/not-found', 'The parent folder does not exist.');
    case 'ENOTDIR':
      return refused('folder-create/not-directory', 'The parent path is not a folder.');
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return refused('folder-create/denied', 'The Host cannot write to that folder.');
    default:
      return refused('folder-create/failed', 'The Host could not create the folder.');
  }
}

function removeEmptyCreatedFolder(path: string, created: Stats): void {
  try {
    const current = lstatSync(path);
    if (
      current.isDirectory() &&
      current.dev === created.dev &&
      current.ino === created.ino &&
      relative(realpathSync.native(path), path) === ''
    ) {
      rmdirSync(path);
    }
  } catch {
    return;
  }
}

export async function createFolderWorkspace(
  payload: unknown,
  {
    human,
    owner,
    team,
    registerWorkspace,
  }: {
    human: HumanContext;
    owner: boolean;
    team: TeamService | undefined;
    registerWorkspace: RegisterFolderWorkspace | undefined;
  },
): Promise<BridgeResult<CreatedFolderWorkspace>> {
  if (human.caller === 'bot' || (!owner && !team?.roles.permissions(human).includes(permission))) {
    return {
      ok: false,
      error: {
        code: 'permission-required',
        message: 'Folder creation permission is required.',
        details: { permission },
      },
    };
  }
  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) return invalidInput('A parent path and single folder name are required.');
  const { name, parent } = parsed.data;
  if (
    !name.trim() ||
    name === '.' ||
    name.includes('..') ||
    /[\\/\0]/u.test(name) ||
    (windows &&
      (/[<>:"|?*\u0001-\u001f]|[ .]$/u.test(name) ||
        /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(name)))
  ) {
    return invalidInput('Use a single valid folder name.');
  }
  if (
    !isAbsolute(parent) ||
    parent.includes('\0') ||
    parent.split(windows ? /[\\/]+/u : /\/+/u).includes('..') ||
    (windows && /^[\\/]$/u.test(parse(parent).root))
  ) {
    return invalidInput('Use a full parent folder path without traversal segments.');
  }
  if (!registerWorkspace)
    return refused('folder-create/unavailable', 'Workspace registration is unavailable.');

  let path: string;
  let created: Stats;
  try {
    const canonical = owner ? realpathSync.native(parent) : canonicalPath(parent);
    if (!owner) team?.spaces.assertFolderCreationParent(human, canonical);
    if (!statSync(canonical).isDirectory())
      return refused('folder-create/not-directory', 'The parent path is not a folder.');
    path = join(canonical, name);
    mkdirSync(path);
    created = lstatSync(path);
  } catch (error) {
    if (error instanceof WorkspaceGrantError)
      return refused('folder-create/outside-grant', 'Choose a folder you have access to.');
    return filesystemRefusal(error);
  }

  try {
    const workspace = await registerWorkspace(path);
    if (relative(workspace.path, path) !== '')
      throw new Error('The registered Workspace resolved to a different directory.');
    return { ok: true, value: workspace };
  } catch {
    removeEmptyCreatedFolder(path, created);
    return refused('folder-create/registration-failed', 'The Host could not register the folder.');
  }
}
