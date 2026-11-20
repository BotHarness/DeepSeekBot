import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import { SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox';

import type { BotHarnessCore } from '../plugin.js';
import { within } from '../workspaces/space-paths.js';
import { isMemberBot } from '../workspaces/grant-execution.js';
import { sessionRoots } from '../workspaces/grant-native-tools.js';
import {
  confinedArgv,
  DENIAL_SIGNATURES,
  probeConfinement,
  RUNNER_FAILURE_SIGNATURE,
  type ConfinementStatus,
  type ExecutionPlan,
} from './linux-confinement.js';

export type ConfinementCore = Pick<
  BotHarnessCore,
  'ownership' | 'runtime' | 'grants' | 'registry'
> & {
  team?: Pick<BotHarnessCore['team'], 'ownerContext' | 'enabled'>;
};

type Mode = 'read-only' | 'workspace-write';

interface Policy {
  mode: string;
  workspaceRoot: string;
  additionalWritableRoots?: readonly string[];
  sessionId?: string;
}

interface Confined {
  argv: string[];
  enforcement: 'full' | 'partial';
  denialSignatures: readonly string[];
  runnerFailureRules: readonly { fatalSignatures: readonly string[] }[];
}

export type PlanResult =
  | { kind: 'unconfined' }
  | { kind: 'refused'; reason: string }
  | { kind: 'plan'; plan: ExecutionPlan; botSlug: string };

const SYSTEM_HIDDEN = ['/home', '/root', '/run', '/mnt', '/media', '/srv'];

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function rootOwner(core: ConfinementCore, sessionId: string) {
  let owner = core.ownership.resolve(sessionId);
  const seen = new Set<string>();
  while (owner?.parentSessionId !== undefined) {
    if (seen.has(owner.sessionId)) return undefined;
    seen.add(owner.sessionId);
    const parent = core.ownership.resolve(owner.parentSessionId);
    if (parent === undefined || parent.botSlug !== owner.botSlug) return undefined;
    owner = parent;
  }
  return owner;
}

function outermost(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)].sort((a, b) => a.length - b.length);
  return unique.filter((path, index) => !unique.slice(0, index).some((root) => within(root, path)));
}

function resolverTarget(): string | undefined {
  try {
    return lstatSync('/etc/resolv.conf').isSymbolicLink()
      ? realpathSync('/etc/resolv.conf')
      : '/etc/resolv.conf';
  } catch {
    return undefined;
  }
}

export function memberExecutionPlan(
  core: ConfinementCore,
  dshHome: string,
  sessionId: string | undefined,
): PlanResult {
  if (sessionId === undefined)
    return core.team?.enabled() === true
      ? { kind: 'refused', reason: 'the command has no calling Session' }
      : { kind: 'unconfined' };
  const owner = core.ownership.resolve(sessionId);
  if (owner === undefined) return { kind: 'unconfined' };
  const root = rootOwner(core, sessionId);
  if (root === undefined) return { kind: 'refused', reason: 'the Session owner is unresolved' };
  if (core.registry.get(root.botSlug) === undefined)
    return { kind: 'refused', reason: 'the PersonaBot is unavailable' };
  if (!isMemberBot(core, root.botSlug)) return { kind: 'unconfined' };
  const memory = core.registry.memoryDirFor(root.botSlug);
  if (memory === undefined) return { kind: 'refused', reason: 'the PersonaBot Memory is missing' };
  const readable = sessionRoots(core, sessionId, 'read', undefined).map(real);
  const writable = sessionRoots(core, sessionId, 'write', undefined).map(real);
  if (readable.length === 0)
    return { kind: 'refused', reason: 'the Session has no authorized folder' };
  const home = join(dirname(memory), 'home');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const allowed = [...readable, home];
  const others = [
    ...core.registry.list().flatMap((record) => {
      const dir = core.registry.memoryDirFor(record.slug);
      return dir === undefined ? [] : [real(dir)];
    }),
    ...core.grants.availableWorkspaces().map((workspace) => real(workspace.path)),
  ].filter((path) => !allowed.some((root) => within(root, path)));
  const hidden = outermost(
    [real(dshHome), real(homedir()), ...SYSTEM_HIDDEN, ...others]
      .filter((path) => existsSync(path))
      .filter((path) => !allowed.includes(path)),
  );
  const sensitive = [real(dshHome), real(homedir()), ...others];
  const tools = [...(process.env['PATH'] ?? '').split(':'), dirname(dirname(process.execPath))]
    .filter((path) => path.startsWith('/') && existsSync(path))
    .map(real)
    .filter(
      (path) =>
        hidden.some((root) => within(root, path)) &&
        !sensitive.some((secret) => within(path, secret)) &&
        ![real(dshHome), ...others].some((secret) => within(secret, path)),
    );
  return {
    kind: 'plan',
    botSlug: root.botSlug,
    plan: {
      readable,
      writable,
      hidden,
      tools: [...new Set(tools)],
      home: real(home),
      resolvConf: resolverTarget(),
    },
  };
}

export function confineMemberCommand(
  plan: ExecutionPlan,
  argv: readonly string[],
  policy: Policy,
  status: ConfinementStatus,
): Confined {
  const mode: Mode = policy.mode === 'workspace-write' ? 'workspace-write' : 'read-only';
  const root = real(policy.workspaceRoot);
  if (!plan.readable.some((allowed) => within(allowed, root)))
    throw new SandboxUnavailableError(mode, 'the working folder is outside this Session');
  return {
    argv: confinedArgv(plan, mode, argv, status.network),
    enforcement: status.network ? 'full' : 'partial',
    denialSignatures: DENIAL_SIGNATURES,
    runnerFailureRules: [{ fatalSignatures: ['bwrap: ', RUNNER_FAILURE_SIGNATURE] }],
  };
}

export class MemberConfinement {
  #status: ConfinementStatus | undefined;

  constructor(
    private readonly core: ConfinementCore,
    private readonly dshHome: string,
    private readonly probe: () => ConfinementStatus = probeConfinement,
  ) {}

  status(): ConfinementStatus {
    this.#status ??= this.probe();
    return this.#status;
  }

  async confine(
    original: (argv: readonly string[], policy: Policy, signal?: AbortSignal) => Promise<Confined>,
    argv: readonly string[],
    policy: Policy,
    signal?: AbortSignal,
  ): Promise<Confined> {
    const result = memberExecutionPlan(this.core, this.dshHome, policy.sessionId);
    const mode: Mode = policy.mode === 'workspace-write' ? 'workspace-write' : 'read-only';
    if (result.kind === 'refused') throw new SandboxUnavailableError(mode, result.reason);
    const confined = await original(argv, policy, signal);
    if (result.kind === 'unconfined') return confined;
    const status = this.status();
    if (!status.filesystem) return { ...confined, enforcement: 'partial' };
    return confineMemberCommand(result.plan, argv, policy, status);
  }
}

export function installMemberConfinement(
  ctx: Context,
  confinement: MemberConfinement,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== 'linux') return;
  ctx.inject(['sandbox'], (child) => {
    const sandbox = child.get('sandbox') as unknown as {
      confine(argv: readonly string[], policy: Policy, signal?: AbortSignal): Promise<Confined>;
    };
    const original = sandbox.confine;
    sandbox.confine = function (this: unknown, argv, policy, signal) {
      return confinement.confine((...args) => original.apply(this, args), argv, policy, signal);
    };
    child.effect(
      () => () => {
        sandbox.confine = original;
      },
      'botharness: member Bot execution confinement',
    );
  });
}
