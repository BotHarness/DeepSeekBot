import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import type { Session } from '@deepseek-ai/dsh-session';

import type { BotHarnessCore } from '../plugin.js';
import { botOwner } from '../team/bot-access.js';
import { currentRoots, orchestratorRoots, rootSessionOwner } from './grant-native-tools.js';

/**
 * Per-workspace read allowlists for the Team sandbox runner
 * (`deepseekbot/dist/sandbox-runner.mjs`, docs/ops/team-vps.md).
 *
 * The runner only sees DSH's bwrap arguments, so the handoff is keyed by the
 * canonical workspace root (DSH's first writable bind). The allowlist is a
 * function of that root alone, never of the calling Session, so two Sessions
 * sharing a root can never race each other into a wider view:
 *
 * - a PersonaBot's Memory: that Bot's Memory plus every active Grant it may read;
 * - any other root (a Grant or an original-attachment folder): the root itself.
 *
 * Other Bots' Memory folders inside a readable root are masked. A Session whose
 * root is another Bot's Memory is refused, so the Memory allowlist is only ever
 * used by its own Bot.
 */
export const EXECUTION_ALLOWLIST_VERSION = 1;

export interface ExecutionAllowlist {
  version: typeof EXECUTION_ALLOWLIST_VERSION;
  root: string;
  read: string[];
  mask: string[];
  account: string;
}

type AllowlistCore = Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry'>;

export function sandboxStateDir(dshHome: string): string {
  return join(dshHome, 'botharness', 'sandbox');
}

export function executionAllowlistPath(stateDir: string, root: string): string {
  return join(stateDir, 'allow', `${createHash('sha256').update(root).digest('hex')}.json`);
}

function canonical(path: string): string | undefined {
  try {
    return realpathSync.native(path);
  } catch {
    return undefined;
  }
}

function covers(parent: string, child: string): boolean {
  const tail = relative(parent, child);
  return tail === '' || (tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail));
}

export class ExecutionAllowlistError extends Error {}

/** Every allowlist one Session's executions may need, keyed by canonical root. */
export function sessionExecutionAllowlists(
  core: AllowlistCore,
  session: Session,
  extraRoots: readonly string[] = [],
): ExecutionAllowlist[] {
  const owner = rootSessionOwner(core, session.id);
  if (owner === undefined) return [];
  const bot = core.registry.get(owner.botSlug);
  if (bot === undefined) return [];
  const memories = new Map<string, string>();
  for (const record of core.registry.list()) {
    const memory = core.registry.memoryDirFor(record.slug);
    const path = memory === undefined ? undefined : canonical(memory);
    if (path !== undefined) memories.set(path, record.slug);
  }
  const roots = new Set<string>();
  for (const root of [
    ...currentRoots(core, session, 'write'),
    ...(session.header.cwd === undefined ? [] : [session.header.cwd]),
    ...extraRoots,
  ]) {
    const path = canonical(root);
    if (path !== undefined) roots.add(path);
  }
  return [...roots].map((root) => {
    const memoryOf = memories.get(root);
    if (memoryOf !== undefined && memoryOf !== owner.botSlug)
      throw new ExecutionAllowlistError("Workspace is another PersonaBot's Memory");
    const read = [
      ...new Set(
        (memoryOf === undefined ? [root] : orchestratorRoots(core, memoryOf, 'read')).flatMap(
          (path) => canonical(path) ?? [],
        ),
      ),
    ];
    const visible = [root, ...read];
    const mask = [...memories.keys()].filter(
      (memory) => memory !== root && visible.some((path) => covers(path, memory)),
    );
    return {
      version: EXECUTION_ALLOWLIST_VERSION,
      root,
      read,
      mask,
      account: botOwner(bot),
    };
  });
}

/** Writes allowlists atomically (0600 in a 0700 folder), skipping unchanged ones. */
export class ExecutionAllowlistStore {
  readonly #written = new Map<string, string>();
  constructor(readonly stateDir: string) {}

  write(allowlist: ExecutionAllowlist): void {
    const file = executionAllowlistPath(this.stateDir, allowlist.root);
    const text = JSON.stringify(allowlist);
    if (this.#written.get(file) === text) return;
    try {
      if (readFileSync(file, 'utf8') === text) {
        this.#written.set(file, text);
        return;
      }
    } catch {
      /* first write */
    }
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, text, { mode: 0o600 });
    renameSync(temporary, file);
    this.#written.set(file, text);
  }

  prepare(core: AllowlistCore, session: Session, extraRoots: readonly string[] = []): void {
    for (const allowlist of sessionExecutionAllowlists(core, session, extraRoots))
      this.write(allowlist);
  }
}

/**
 * The allowlist store when this Host runs the Team sandbox runner
 * (`DEEPSEEKBOT_SANDBOX_RUNNER` set on Linux); undefined otherwise.
 */
export function executionAllowlistStoreFor(
  dshHome: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ExecutionAllowlistStore | undefined {
  return platform === 'linux' && env['DEEPSEEKBOT_SANDBOX_RUNNER']
    ? new ExecutionAllowlistStore(sandboxStateDir(dshHome))
    : undefined;
}
