import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { Session } from '@deepseek-ai/dsh-session';

import type { BotHarnessCore } from '../plugin.js';

type GrantCore = Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry'>;
type AccessKind = 'read' | 'write';

export const NATIVE_FILE_TOOL_NAMES = new Set([
  'read',
  'read_image',
  'write',
  'edit',
  'str_replace_editor',
  'glob',
  'grep',
]);

export const NATIVE_SHELL_TOOL_NAMES = new Set(['bash', 'pwsh']);

function within(root: string, target: string): boolean {
  const tail = relative(root, target);
  return tail === '' || (tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail));
}

function canonicalTarget(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
    try {
      lstatSync(path);
      return undefined;
    } catch (leafError) {
      if ((leafError as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
    }
    try {
      return join(realpathSync(dirname(path)), basename(path));
    } catch {
      return undefined;
    }
  }
}

function canonicalRoot(root: string): string | undefined {
  try {
    const path = resolve(root);
    const canonical = realpathSync(path);
    return canonical === join(realpathSync(dirname(path)), basename(path)) ? canonical : undefined;
  } catch {
    return undefined;
  }
}

export function currentRoots(core: GrantCore, session: Session, kind: AccessKind): string[] {
  let owner = core.ownership.resolve(session.id);
  if (owner === undefined) return [];
  const seen = new Set<string>();
  while (owner.parentSessionId !== undefined) {
    if (seen.has(owner.sessionId)) return [];
    seen.add(owner.sessionId);
    const parent = core.ownership.resolve(owner.parentSessionId);
    if (parent === undefined) return [];
    owner = parent;
  }
  if (owner.rootRole === 'orchestrator') {
    const memory = core.registry.memoryDirFor(owner.botSlug);
    if (memory === undefined) return [];
    const active = core.grants
      .list(owner.botSlug)
      .filter((grant) => grant.revokedAt === undefined)
      .flatMap((grant) => {
        try {
          const current = core.grants.requireActive(owner.botSlug, grant.id);
          return kind === 'read' || current.orchestratorWrite === true
            ? [current.workspacePath]
            : [];
        } catch {
          return [];
        }
      });
    return [memory, ...active];
  }
  if (owner.rootRole !== 'assignment') return [];
  const permission = core.runtime.getAssignment(owner.botSlug, owner.sessionId)?.permission;
  if (permission === undefined || permission.primaryCwd !== session.header.cwd) return [];
  try {
    const grant = core.grants.requireActive(owner.botSlug, permission.grantId);
    return (kind === 'read' || grant.orchestratorWrite === true) &&
      grant.workspaceId === permission.workspaceId &&
      grant.workspacePath === permission.primaryCwd
      ? [grant.workspacePath]
      : [];
  } catch {
    return [];
  }
}

function nativePath(name: string, args: unknown): { path: string; kind: AccessKind } | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const input = args as Record<string, unknown>;
  if (name === 'glob' || name === 'grep') {
    return {
      path: typeof input.path === 'string' ? input.path : '.',
      kind: 'read',
    };
  }
  const path = name === 'str_replace_editor' ? input.path : input.file_path;
  if (typeof path !== 'string' || path.trim() === '') return undefined;
  if (name === 'str_replace_editor') {
    if (input.command === 'view') return { path, kind: 'read' };
    if (['create', 'str_replace', 'insert'].includes(String(input.command))) {
      return { path, kind: 'write' };
    }
    return undefined;
  }
  return { path, kind: name === 'write' || name === 'edit' ? 'write' : 'read' };
}

export function nativeFileToolDenial(
  core: GrantCore,
  session: Session,
  name: string,
  args: unknown,
): string | undefined {
  const request = nativePath(name, args);
  if (request === undefined) return 'BotHarness Session requires a valid native file path';
  const cwd = session.header.cwd;
  if (cwd === undefined) return 'BotHarness Session working directory is unavailable';
  const target = canonicalTarget(resolve(cwd, request.path));
  if (target === undefined) return 'BotHarness Session file path cannot be resolved';
  if (
    core.ownership.resolve(session.id)?.rootRole === 'orchestrator' &&
    core.runtime.originalAttachmentRoot?.(session.id, target, request.kind) !== undefined
  )
    return undefined;
  const roots = currentRoots(core, session, request.kind);
  for (const root of roots) {
    const canonical = canonicalRoot(root);
    if (canonical !== undefined && within(canonical, target)) return undefined;
  }
  return "Path is outside this Session's authorized workspace";
}

export function nativeExecutionRoot(
  core: GrantCore,
  session: Session,
  name: string,
  args: unknown,
): string {
  const input = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
  const shell = NATIVE_SHELL_TOOL_NAMES.has(name);
  const request = shell
    ? { path: typeof input.workdir === 'string' ? input.workdir : '.', kind: 'write' as const }
    : nativePath(name, args);
  if (request === undefined || session.header.cwd === undefined)
    throw new Error('BotHarness requires an authorized execution path');
  const target = canonicalTarget(resolve(session.header.cwd, request.path));
  if (target !== undefined) {
    if (core.ownership.resolve(session.id)?.rootRole === 'orchestrator') {
      const original = core.runtime.originalAttachmentRoot?.(
        session.id,
        target,
        request.kind,
        shell,
      );
      if (original !== undefined) return original;
    }
    for (const root of currentRoots(core, session, request.kind)) {
      const canonical = canonicalRoot(root);
      if (canonical !== undefined && within(canonical, target)) return root;
    }
  }
  throw new Error("Path is outside this Session's authorized workspace");
}

export function authorizedPathRoot(roots: readonly string[], path: string): string | undefined {
  const target = canonicalTarget(path);
  if (target === undefined) return undefined;
  return roots.find((root) => {
    const canonical = canonicalRoot(root);
    return canonical !== undefined && within(canonical, target);
  });
}
