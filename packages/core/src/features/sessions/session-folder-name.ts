import { posix, win32 } from 'node:path';

export function sessionFolderName(cwd: string): string {
  const path = win32.isAbsolute(cwd) && !posix.isAbsolute(cwd) ? win32 : posix;
  return path.basename(cwd) || path.parse(cwd).root;
}
