import { z } from 'zod';
import { setImmediate } from 'node:timers/promises';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { Session } from '@deepseek-ai/dsh-session';

import type { BotHarnessCore } from '../plugin.js';

type GrantCore = Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry'>;
type AccessKind = 'read' | 'write';

export const NATIVE_FILE_TOOL_NAMES = new Set([
  'apply_patch',
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

function missingEntry(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

function canonicalTarget(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
  }
  const missing: string[] = [];
  let current = path;
  while (true) {
    if (!missingEntry(current)) return undefined;
    missing.unshift(basename(current));
    const parent = dirname(current);
    if (parent === current) return undefined;
    try {
      const real = realpathSync(parent);
      if (!statSync(real).isDirectory()) return undefined;
      return join(real, ...missing);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
    }
    current = parent;
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

function nativePaths(name: string, args: unknown): { path: string; kind: AccessKind }[] {
  if (name !== 'apply_patch') {
    const request = nativePath(name, args);
    return request ? [request] : [];
  }
  if (
    typeof args !== 'object' ||
    args === null ||
    !('input' in args) ||
    typeof args.input !== 'string'
  )
    return [];
  return [
    ...args.input.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gmu),
  ].map((match) => ({ path: match[1]!, kind: 'write' }));
}

function validateSpacePath(core: GrantCore, session: Session, path: string): string | undefined {
  const owner = core.ownership.resolve(session.id);
  if (!owner || !core.grants.validatePath) return undefined;
  try {
    core.grants.validatePath?.(owner.botSlug, path);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'grant-protected-path';
  }
}

function originalAttachmentRoot(
  core: GrantCore,
  session: Session,
  path: string,
  kind: AccessKind,
  shell = false,
): string | undefined {
  if (core.ownership.resolve(session.id)?.rootRole !== 'orchestrator') return undefined;
  try {
    const stat = statSync(path);
    if (stat.isFile() && stat.nlink !== 1) return undefined;
  } catch {}
  return core.runtime.originalAttachmentRoot?.(session.id, path, kind, shell);
}

export function nativeFileSpaceDenial(
  core: GrantCore,
  session: Session,
  name: string,
  args: unknown,
): string | undefined {
  try {
    return nativeFileSpaceDenialImpl(core, session, name, args);
  } catch (error) {
    return error instanceof Error ? error.message : 'grant-protected-path';
  }
}

function nativeFileSpaceDenialImpl(
  core: GrantCore,
  session: Session,
  name: string,
  args: unknown,
): string | undefined {
  if (!core.grants.validatePath) return undefined;
  const requests = nativePaths(name, args);
  if (!requests.length || session.header.cwd === undefined) return 'grant-protected-path';
  for (const request of requests) {
    const path = isAbsolute(request.path) ? request.path : session.header.cwd + sep + request.path;
    const target = canonicalTarget(path);
    if (target === undefined)
      return validateSpacePath(core, session, path) ?? 'grant-protected-path';
    if (originalAttachmentRoot(core, session, target, request.kind) !== undefined) continue;
    const denial = validateSpacePath(core, session, path);
    if (denial) return denial;
  }
  return undefined;
}

export function nativeFileToolDenial(
  core: GrantCore,
  session: Session,
  name: string,
  args: unknown,
): string | undefined {
  try {
    return nativeFileToolDenialImpl(core, session, name, args);
  } catch (error) {
    return error instanceof Error ? error.message : 'grant-protected-path';
  }
}

function nativeFileToolDenialImpl(
  core: GrantCore,
  session: Session,
  name: string,
  args: unknown,
): string | undefined {
  const requests = nativePaths(name, args);
  if (!requests.length) return 'BotHarness Session requires a valid native file path';
  const cwd = session.header.cwd;
  if (cwd === undefined) return 'BotHarness Session working directory is unavailable';
  for (const request of requests) {
    const path = isAbsolute(request.path) ? request.path : cwd + sep + request.path;
    const target = canonicalTarget(path);
    if (target === undefined)
      return (
        validateSpacePath(core, session, path) ?? 'BotHarness Session file path cannot be resolved'
      );
    if (originalAttachmentRoot(core, session, target, request.kind) !== undefined) continue;
    const spaceDenial = validateSpacePath(core, session, path);
    if (spaceDenial) return spaceDenial;
    const roots = currentRoots(core, session, request.kind);
    if (
      !roots.some((root) => {
        const canonical = canonicalRoot(root);
        return canonical !== undefined && within(canonical, target);
      })
    )
      return "Path is outside this Session's authorized workspace";
  }
  return undefined;
}

export function installNativeSearchResultGuard(
  ctx: Context,
  core: GrantCore,
  fullAccess: (session: Session) => boolean,
): () => void {
  return ctx.on(
    'tools/execute',
    async (execution, next) => {
      const session = execution.agent?.session;
      if (
        !session ||
        !core.ownership.resolve(session.id) ||
        (execution.name !== 'glob' && execution.name !== 'grep')
      )
        return next();
      const result = await next();
      await assertNativeSearchResult(
        core,
        session,
        execution.name,
        result,
        execution.signal,
        fullAccess(session),
      );
      return result;
    },
    { global: true },
  );
}

export async function assertNativeSearchResult(
  core: GrantCore,
  session: Session,
  name: string,
  result: ToolExecutionResult,
  signal: AbortSignal,
  fullAccess = false,
): Promise<void> {
  if (result.isError || (name !== 'glob' && name !== 'grep')) return;
  const paths =
    name === 'glob'
      ? z.object({ paths: z.array(z.string()) }).parse(result.value).paths
      : z
          .object({ matches: z.array(z.object({ path: z.string() })) })
          .parse(result.value)
          .matches.map((match) => match.path);
  let visited = 0;
  for (const path of new Set(paths)) {
    signal.throwIfAborted();
    if (visited++ % 64 === 0) await setImmediate(undefined, { signal });
    const denial = (fullAccess ? nativeFileSpaceDenial : nativeFileToolDenial)(
      core,
      session,
      'read',
      { file_path: path },
    );
    if (denial) throw new Error(denial);
  }
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
    : nativePaths(name, args)[0];
  if (request === undefined || session.header.cwd === undefined)
    throw new Error('BotHarness requires an authorized execution path');
  const target = canonicalTarget(resolve(session.header.cwd, request.path));
  if (target !== undefined) {
    if (!shell) {
      const denial = nativeFileToolDenial(core, session, name, args);
      if (denial) throw new Error(denial);
    }
    const original = originalAttachmentRoot(core, session, target, request.kind, shell);
    if (original !== undefined) return original;
  }
  const spacePathDenial = validateSpacePath(
    core,
    session,
    resolve(session.header.cwd, request.path),
  );
  if (spacePathDenial) throw new Error(spacePathDenial);
  if (target !== undefined) {
    for (const root of currentRoots(core, session, request.kind)) {
      const canonical = canonicalRoot(root);
      if (
        canonical !== undefined &&
        within(canonical, target) &&
        (shell ||
          nativePaths(name, args).every((entry) => {
            const path = canonicalTarget(resolve(session.header.cwd!, entry.path));
            return path !== undefined && within(canonical, path);
          }))
      )
        return root;
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
