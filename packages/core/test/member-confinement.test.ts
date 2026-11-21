import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bwrapArgs,
  probeConfinement,
  secretEnvNames,
  type ConfinementStatus,
} from '../src/execution/linux-confinement.js';
import {
  confineMemberCommand,
  MemberConfinement,
  memberExecutionPlan,
  type ConfinementCore,
} from '../src/execution/member-confinement.js';
import { within } from '../src/workspaces/space-paths.js';

interface Owner {
  sessionId: string;
  botSlug: string;
  rootRole: 'orchestrator' | 'assignment';
  parentSessionId?: string;
}

function fixture(root: string, teamEnabled = true) {
  const dsh = join(root, 'dsh');
  const write = (path: string, text: string) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
  };
  const memory = {
    ada: join(dsh, 'spaces', 'alice', 'bots', 'ada', 'memory'),
    ben: join(dsh, 'spaces', 'bob', 'bots', 'ben', 'memory'),
    owl: join(dsh, 'spaces', 'owner', 'bots', 'owl', 'memory'),
  };
  write(join(memory.ada, 'note.md'), 'ada memory');
  write(join(memory.ben, 'secret.md'), 'ben memory');
  write(join(memory.owl, 'note.md'), 'owner memory');
  write(join(dsh, 'spaces', 'bob', 'private.md'), 'bob account');
  write(join(dsh, 'shared', 'finance', 'ledger.md'), 'finance');
  write(join(dsh, '.credentials.yaml'), 'token: secret');
  write(join(dsh, 'botharness', 'botharness.db'), 'database');
  const work = {
    alpha: join(root, 'work', 'alpha'),
    beta: join(root, 'work', 'beta'),
    gamma: join(root, 'work', 'gamma'),
  };
  write(join(work.alpha, 'readme.md'), 'alpha');
  write(join(work.beta, 'readme.md'), 'beta');
  write(join(work.gamma, 'readme.md'), 'gamma');
  const bots = [
    { slug: 'ada', ownerHumanId: 'alice' },
    { slug: 'ben', ownerHumanId: 'bob' },
    { slug: 'owl', ownerHumanId: 'owner' },
  ];
  const grants: Record<
    string,
    { id: string; workspaceId: string; workspacePath: string; orchestratorWrite: boolean }[]
  > = {
    ada: [
      { id: 'g-alpha', workspaceId: 'w-alpha', workspacePath: work.alpha, orchestratorWrite: true },
      { id: 'g-beta', workspaceId: 'w-beta', workspacePath: work.beta, orchestratorWrite: false },
    ],
    ben: [
      { id: 'g-gamma', workspaceId: 'w-gamma', workspacePath: work.gamma, orchestratorWrite: true },
    ],
    owl: [],
  };
  const owners = new Map<string, Owner>([
    ['ada-chat', { sessionId: 'ada-chat', botSlug: 'ada', rootRole: 'orchestrator' }],
    [
      'ada-sub',
      {
        sessionId: 'ada-sub',
        botSlug: 'ada',
        rootRole: 'orchestrator',
        parentSessionId: 'ada-chat',
      },
    ],
    ['ada-task', { sessionId: 'ada-task', botSlug: 'ada', rootRole: 'assignment' }],
    ['owl-chat', { sessionId: 'owl-chat', botSlug: 'owl', rootRole: 'orchestrator' }],
    ['ghost-chat', { sessionId: 'ghost-chat', botSlug: 'ghost', rootRole: 'orchestrator' }],
  ]);
  const core = {
    ownership: { resolve: (id: string) => owners.get(id) },
    registry: {
      get: (slug: string) => bots.find((bot) => bot.slug === slug),
      list: () => bots,
      memoryDirFor: (slug: string) => memory[slug as keyof typeof memory],
    },
    grants: {
      list: (slug: string) => grants[slug] ?? [],
      requireActive: (slug: string, id: string) => {
        const grant = (grants[slug] ?? []).find((entry) => entry.id === id);
        if (grant === undefined) throw new Error('grant missing');
        return grant;
      },
      availableWorkspaces: () =>
        Object.values(grants)
          .flat()
          .map((grant) => ({ id: grant.workspaceId, path: grant.workspacePath, title: grant.id })),
    },
    runtime: {
      getAssignment: (slug: string, sessionId: string) =>
        slug === 'ada' && sessionId === 'ada-task'
          ? {
              permission: {
                grantId: 'g-alpha',
                workspaceId: 'w-alpha',
                primaryCwd: work.alpha,
                mode: 'workspace-write',
              },
            }
          : undefined,
    },
    team: { ownerContext: () => ({ humanId: 'owner' }), enabled: () => teamEnabled },
  } as unknown as ConfinementCore;
  return { core, dsh, memory, work };
}

const original = (argv: readonly string[]) =>
  Promise.resolve({
    argv: ['bwrap', '--ro-bind', '/', '/', '--', ...argv],
    enforcement: 'full' as const,
    denialSignatures: ['read-only file system'],
    runnerFailureRules: [{ fatalSignatures: ['bwrap: '] }],
  });

describe('confinement probe', () => {
  it.skipIf(process.platform !== 'linux')(
    'finds network tools in sbin when the Host PATH leaves it out',
    () => {
      const spawn = ((command: string, args: string[]) => {
        const script = args[1] ?? '';
        if (command === '/bin/sh' && /^(?:PATH=\S+ )?command -v \w+$/u.test(script))
          return spawnSync(
            '/bin/sh',
            ['-c', script.replace(/command -v \w+$/u, 'command -v addgroup')],
            { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' }, shell: false, windowsHide: true },
          );
        return { status: 0, stdout: 'routed', error: undefined };
      }) as unknown as typeof spawnSync;
      expect(probeConfinement(spawn, 'linux')).toEqual({
        enforcement: 'full',
        filesystem: true,
        network: true,
        missing: [],
      });
    },
  );
});

describe('member Bot execution plan', () => {
  let root: string;
  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'bh-plan-')));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('refuses a command without a calling Session while Team mode is on', () => {
    expect(memberExecutionPlan(fixture(root).core, join(root, 'dsh'), undefined)).toEqual({
      kind: 'refused',
      reason: 'the command has no calling Session',
    });
    expect(memberExecutionPlan(fixture(root, false).core, join(root, 'dsh'), undefined)).toEqual({
      kind: 'unconfined',
    });
  });

  it('refuses an owned Session whose Bot is gone instead of widening access', () => {
    const f = fixture(root);
    expect(memberExecutionPlan(f.core, f.dsh, 'ghost-chat').kind).toBe('refused');
  });

  it('leaves the Owner Bot and non-Bot Sessions on the DSH profile', async () => {
    const f = fixture(root);
    expect(memberExecutionPlan(f.core, f.dsh, 'owl-chat')).toEqual({ kind: 'unconfined' });
    expect(memberExecutionPlan(f.core, f.dsh, 'native-session')).toEqual({ kind: 'unconfined' });
    const confinement = new MemberConfinement(f.core, f.dsh, () => {
      throw new Error('probe must not run for an unconfined Session');
    });
    const result = await confinement.confine(original, ['true'], {
      mode: 'workspace-write',
      workspaceRoot: f.memory.owl,
      sessionId: 'owl-chat',
    });
    expect(result.argv).toEqual(['bwrap', '--ro-bind', '/', '/', '--', 'true']);
  });

  it('binds an Orchestrator Memory and Grants and hides the rest of the Host', () => {
    const f = fixture(root);
    const result = memberExecutionPlan(f.core, f.dsh, 'ada-sub');
    if (result.kind !== 'plan') throw new Error(result.kind);
    expect(result.plan.readable).toEqual([f.memory.ada, f.work.alpha, f.work.beta]);
    expect(result.plan.writable).toEqual([f.memory.ada, f.work.alpha]);
    for (const path of [f.dsh, f.memory.ben, f.work.gamma]) {
      expect(
        result.plan.hidden.some((root) => within(root, path)),
        path,
      ).toBe(true);
    }
    expect(result.plan.home).toBe(join(f.dsh, 'spaces', 'alice', 'bots', 'ada', 'home'));
  });

  it('limits an Assignment to its primary Grant', () => {
    const f = fixture(root);
    const result = memberExecutionPlan(f.core, f.dsh, 'ada-task');
    if (result.kind !== 'plan') throw new Error(result.kind);
    expect(result.plan.readable).toEqual([f.work.alpha]);
    expect(result.plan.writable).toEqual([f.work.alpha]);
    for (const path of [f.memory.ada, f.work.beta, f.work.gamma]) {
      expect(
        result.plan.hidden.some((root) => within(root, path)),
        path,
      ).toBe(true);
    }
  });

  it('refuses a working folder outside the Session roots', () => {
    const f = fixture(root);
    const result = memberExecutionPlan(f.core, f.dsh, 'ada-task');
    if (result.kind !== 'plan') throw new Error(result.kind);
    expect(() =>
      confineMemberCommand(
        result.plan,
        ['true'],
        { mode: 'workspace-write', workspaceRoot: f.work.beta },
        { enforcement: 'full', filesystem: true, network: true, missing: [] },
      ),
    ).toThrow(/outside this Session/u);
  });

  it('refuses through the sandbox seam when the Session is missing', async () => {
    const f = fixture(root);
    const confinement = new MemberConfinement(f.core, f.dsh, () => ({
      enforcement: 'full',
      filesystem: true,
      network: true,
      missing: [],
    }));
    await expect(
      confinement.confine(original, ['true'], { mode: 'workspace-write', workspaceRoot: f.dsh }),
    ).rejects.toMatchObject({ code: 'SANDBOX_UNAVAILABLE' });
  });

  it('hides paths before binding allowed roots and binds a private resolver with the network', () => {
    const args = bwrapArgs(
      {
        readable: ['/srv/a'],
        writable: ['/srv/a'],
        hidden: ['/srv'],
        home: '/srv/a/home',
        resolvConf: '/etc/resolv.conf',
      },
      'workspace-write',
      true,
    );
    expect(args.indexOf('/srv')).toBeLessThan(args.indexOf('/srv/a'));
    expect(args.join(' ')).toContain('--ro-bind-data 9 /etc/resolv.conf');
  });

  it('names secret environment variables for removal', () => {
    expect(
      secretEnvNames({
        OPENCODE_GO_API_KEY: '1',
        GITHUB_TOKEN: '1',
        DSH_HOME: '1',
        DEEPSEEKBOT_HOST: '1',
        PATH: '1',
        KEYBOARD: '1',
        GIT_CONFIG_KEY_0: '1',
        AWS_ACCESS_KEY_ID: '1',
      }).sort(),
    ).toEqual([
      'AWS_ACCESS_KEY_ID',
      'DEEPSEEKBOT_HOST',
      'DSH_HOME',
      'GITHUB_TOKEN',
      'OPENCODE_GO_API_KEY',
    ]);
  });
});

const status: ConfinementStatus =
  process.platform === 'linux'
    ? probeConfinement()
    : { enforcement: 'unavailable', filesystem: false, network: false, missing: ['linux'] };

describe.skipIf(!status.filesystem)('member Bot Shell under bwrap', () => {
  let root: string;
  let server: Server;
  let port = 0;
  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'bh-confine-')));
    server = createServer((socket) => socket.end('host api\n'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  const run = (sessionId: string, workspaceRoot: string, script: string) => {
    const f = fixture(root);
    const plan = memberExecutionPlan(f.core, f.dsh, sessionId);
    if (plan.kind !== 'plan') throw new Error(plan.kind);
    const confined = confineMemberCommand(
      plan.plan,
      ['/bin/sh', '-c', script],
      { mode: 'workspace-write', workspaceRoot, sessionId },
      status,
    );
    const result = spawnSync(confined.argv[0]!, confined.argv.slice(1), {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, OPENCODE_GO_API_KEY: 'sk-test', DSH_HOME: f.dsh },
      shell: false,
      windowsHide: true,
    });
    return { ...result, f, enforcement: confined.enforcement };
  };

  it("keeps Alice's Bot out of Bob's spaces, shared roles and the Host data", () => {
    const f = fixture(root);
    const targets = [
      join(f.memory.ben, 'secret.md'),
      join(f.dsh, 'spaces', 'bob', 'private.md'),
      join(f.dsh, 'shared', 'finance', 'ledger.md'),
      join(f.dsh, '.credentials.yaml'),
      join(f.dsh, 'botharness', 'botharness.db'),
      join(f.work.gamma, 'readme.md'),
    ];
    const result = run(
      'ada-chat',
      f.memory.ada,
      targets.map((path) => `cat '${path}' 2>/dev/null && echo LEAK`).join('; ') +
        `; cat '${join(f.memory.ada, 'note.md')}'; cat '${join(f.work.beta, 'readme.md')}'`,
    );
    expect(result.stdout).not.toContain('LEAK');
    expect(result.stdout).toContain('ada memory');
    expect(result.stdout).toContain('beta');
  });

  it('lets the Bot write its Memory and writable Grant but not a read-only Grant', () => {
    const f = fixture(root);
    const result = run(
      'ada-chat',
      f.memory.ada,
      `echo ok > '${join(f.memory.ada, 'new.md')}' && echo memory-ok; echo ok > '${join(f.work.alpha, 'new.md')}' && echo grant-ok; echo no > '${join(f.work.beta, 'new.md')}' || echo beta-denied; echo $HOME; touch "$HOME/x" && echo home-ok`,
    );
    expect(result.stdout).toContain('memory-ok');
    expect(result.stdout).toContain('grant-ok');
    expect(result.stdout).toContain('beta-denied');
    expect(result.stdout).toContain('home-ok');
    expect(result.stdout).toContain(join('bots', 'ada', 'home'));
  });

  it('still runs ordinary Git work inside the Bot roots', () => {
    const f = fixture(root);
    const result = run(
      'ada-chat',
      f.work.alpha,
      `cd '${f.work.alpha}' && git init -q && git add readme.md && git -c user.name=ada -c user.email=ada@example.invalid commit -qm init && git log --format=%s`,
    );
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('init');
  });

  it("keeps an Assignment out of the same Bot's other Grants", () => {
    const f = fixture(root);
    const result = run(
      'ada-task',
      f.work.alpha,
      `cat '${join(f.work.alpha, 'readme.md')}'; cat '${join(f.work.beta, 'readme.md')}' 2>/dev/null && echo LEAK; cat '${join(f.memory.ada, 'note.md')}' 2>/dev/null && echo LEAK`,
    );
    expect(result.stdout).toContain('alpha');
    expect(result.stdout).not.toContain('LEAK');
  });

  it('removes secrets from the command environment', () => {
    const f = fixture(root);
    const result = run('ada-chat', f.memory.ada, 'env');
    expect(result.stdout).toContain('PATH=');
    expect(result.stdout).not.toContain('OPENCODE_GO_API_KEY');
    expect(result.stdout).not.toContain('DSH_HOME');
  });

  it.skipIf(!status.network)('refuses loopback ports such as the Host API', () => {
    const f = fixture(root);
    const result = run(
      'ada-chat',
      f.memory.ada,
      `'${process.execPath}' -e "const s=require('net').connect(${port},'127.0.0.1');s.on('data',d=>{process.stdout.write('LEAK '+d);process.exit(0)});s.on('error',e=>{console.log('refused',e.code);process.exit(0)});setTimeout(()=>{console.log('timeout');process.exit(0)},5000)"`,
    );
    expect(result.enforcement).toBe('full');
    expect(result.stdout).toContain('refused');
    expect(result.stdout).not.toContain('LEAK');
  });

  it.skipIf(!status.network)('refuses the Host gateway, link-local and tailnet addresses', () => {
    const f = fixture(root);
    const probe = (host: string, target: number) =>
      `'${process.execPath}' -e "const s=require('net').connect(${target},'${host}');s.on('connect',()=>{console.log('LEAK ${host}');process.exit(0)});s.on('error',e=>{console.log('refused ${host}');process.exit(0)});setTimeout(()=>{console.log('timeout ${host}');process.exit(0)},5000)"`;
    const result = run(
      'ada-chat',
      f.memory.ada,
      [
        probe('10.0.2.2', port),
        probe('169.254.169.254', 80),
        probe('100.100.100.100', 80),
        probe('192.168.1.1', 80),
      ].join('; '),
    );
    expect(result.stdout).not.toContain('LEAK');
    expect(result.stdout.match(/refused/gu)).toHaveLength(4);
  });
});
