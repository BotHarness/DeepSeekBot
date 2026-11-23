import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  alignAssignmentPermission,
  alignOrchestratorPermission,
  admitBotSession,
  borrowedAgentDenial,
  grantExecutionDenial,
  sessionRefusalMessage,
  grantToolExecutionDenial,
  orchestratorPermission,
} from '../src/workspaces/grant-execution.js';
import { botSlug, assignmentSessionId, grantId, cwd, fixture } from './support/grant-execution.js';

describe('Workspace Grant execution boundary', () => {
  it('fails closed if a BotHarness-created Session loses its durable owner', () => {
    const state = fixture();
    const orphaned = { id: 'botharness-orphaned', header: { cwd } } as never;
    expect(grantExecutionDenial(state.core, orphaned, state.policy, state.approval)).toMatch(
      /no durable owner/,
    );
  });

  it('fails closed for an unclaimed native fork of an owned Session', () => {
    const state = fixture();
    const fork = {
      id: 'native-fork-id',
      header: { cwd, parentSession: assignmentSessionId },
    } as never;
    expect(grantExecutionDenial(state.core, fork, state.policy, state.approval)).toMatch(
      /no durable owner/,
    );
  });

  it('denies a native Orchestrator mode switch and ignores unrelated DSH sessions', () => {
    const state = fixture();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    const orchestrator = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    expect(grantExecutionDenial(state.core, orchestrator, state.policy, state.approval)).toMatch(
      /differs from this PersonaBot's access setting/,
    );
    const ordinary = { id: 'native-dsh', header: { cwd } } as never;
    expect(
      grantExecutionDenial(state.core, ordinary, state.policy, state.approval),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(state.core, ordinary, state.policy, state.approval, 'bash', {
        sandbox_permissions: 'danger-full-access',
      }),
    ).toBeUndefined();
  });

  it('runs the Orchestrator unconfined only while the PersonaBot access setting is full access', () => {
    const state = fixture();
    const orchestrator = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
    } as never;
    let mode: 'workspace-write' | 'danger-full-access' = 'danger-full-access';
    let scope: 'chat' | 'assignments' = 'assignments';
    const core = {
      ...(state.core as object),
      assignmentAccess: { get: () => ({ botSlug, mode, scope, revision: 1 }) },
    } as never;
    expect(orchestratorPermission(core, botSlug)).toEqual({
      mode: 'workspace-write',
      approval: 'ask',
    });
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toBeUndefined();
    scope = 'chat';
    expect(orchestratorPermission(core, botSlug)).toEqual({
      mode: 'danger-full-access',
      approval: 'ask',
    });
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toMatch(
      /differs from this PersonaBot's access setting/,
    );
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    state.overrideOf.mockReturnValue('ask');
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toBeUndefined();
    expect(
      grantToolExecutionDenial(core, orchestrator, state.policy, state.approval, 'bash', {
        command: 'touch /outside/project/file',
      }),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(core, orchestrator, state.policy, state.approval, 'write', {
        file_path: '/outside/project/file',
        content: 'x',
      }),
    ).toBeUndefined();
    mode = 'workspace-write';
    expect(orchestratorPermission(core, botSlug)).toEqual({
      mode: 'workspace-write',
      approval: 'ask',
    });
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toMatch(
      /differs from this PersonaBot's access setting/,
    );
  });

  it.each([
    [
      'Orchestrator Session requires its Memory working directory',
      'MEMORY_CWD_MISMATCH',
      'Start a new Session',
    ],
    [
      "Orchestrator Session permission differs from this PersonaBot's access setting",
      'SESSION_PERMISSION_MISMATCH',
      'Full access',
    ],
    [
      "Orchestrator Subagent permission differs from this PersonaBot's access setting",
      'SESSION_PERMISSION_MISMATCH',
      'Full access',
    ],
    [
      'Assignment Session permission snapshot is missing or mismatched',
      'ASSIGNMENT_PERMISSION_MISMATCH',
      'new Assignment',
    ],
    [
      'Assignment Session permission mode differs from its snapshot',
      'ASSIGNMENT_PERMISSION_MISMATCH',
      'new Assignment',
    ],
    [
      'Assignment Workspace Grant is missing, revoked, or unavailable',
      'GRANT_UNAVAILABLE',
      'Authorize the folder again',
    ],
    [
      'Assignment Workspace Grant no longer matches its permission snapshot',
      'GRANT_UNAVAILABLE',
      'Authorize the folder again',
    ],
    [
      'DSH permission services are unavailable for BotHarness Session',
      'PERMISSION_UNAVAILABLE',
      'Restart the Host',
    ],
    ['BotHarness Session has no durable owner', 'SESSION_OWNER_MISSING', 'Start a new Session'],
    ['BotHarness Session ownership is cyclic', 'SESSION_OWNER_MISSING', 'Start a new Session'],
    ['Unknown BotHarness Session role', 'SESSION_OWNER_MISSING', 'Start a new Session'],
    ['PersonaBot identity is deleted or unavailable', 'BOT_UNAVAILABLE', undefined],
    ['Something new', 'SESSION_REFUSED', undefined],
  ])('names the refusal %s and its Human fix', (denial, code, fix) => {
    const message = sessionRefusalMessage(denial);
    expect(message.startsWith(`${code}: The Host refused this turn: ${denial}.`)).toBe(true);
    if (fix === undefined) expect(message).toBe(`${code}: The Host refused this turn: ${denial}.`);
    else expect(message).toContain(fix);
  });

  it('aligns a natively resumed Orchestrator whose access setting changed while it was idle', () => {
    const state = fixture();
    let mode: 'workspace-write' | 'danger-full-access' = 'workspace-write';
    const core = {
      ...(state.core as object),
      assignmentAccess: { get: () => ({ botSlug, mode, scope: 'chat', revision: 1 }) },
    } as never;
    const appended: Array<[string, unknown]> = [];
    const orchestrator = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
      append: (type: string, data: unknown) => appended.push([type, data]),
    } as never;
    expect(alignOrchestratorPermission(core, orchestrator, state.policy, state.approval)).toBe(
      false,
    );
    mode = 'danger-full-access';
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toMatch(
      /Orchestrator Session permission differs/,
    );
    expect(alignOrchestratorPermission(core, orchestrator, state.policy, state.approval)).toBe(
      true,
    );
    expect(appended).toEqual([
      ['sandbox/mode', { mode: 'danger-full-access' }],
      ['approval/policy', { policy: 'ask' }],
    ]);
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toBeUndefined();
    const assignment = { ...(state.assignment as object), append: vi.fn() } as never;
    expect(
      alignOrchestratorPermission(core, assignment, state.policy, state.approval),
    ).toBeUndefined();
    expect(
      alignOrchestratorPermission(core, orchestrator, undefined, state.approval),
    ).toBeUndefined();
  });

  it('lets the Host borrow a native Orchestrator after its access setting changed', () => {
    const state = fixture();
    const core = {
      ...(state.core as object),
      assignmentAccess: {
        get: () => ({ botSlug, mode: 'danger-full-access', scope: 'chat', revision: 2 }),
      },
    } as never;
    const orchestrator = {
      id: 'botharness-orchestrator',
      header: { cwd: '/tmp/memory' },
      append: (type: string, data: { mode?: string }) => {
        if (type === 'sandbox/mode') state.resolvePolicy.mockReturnValue({ mode: data.mode! });
      },
    } as never;
    expect(grantExecutionDenial(core, orchestrator, state.policy, state.approval)).toMatch(
      /Orchestrator Session permission differs/,
    );
    expect(
      admitBotSession(core, orchestrator, 'orchestrator', state.policy, state.approval),
    ).toBeUndefined();
    expect(admitBotSession(core, orchestrator, 'assignment', state.policy, state.approval)).toBe(
      'BotHarness Agent role mismatch',
    );
    state.getAssignment.mockReturnValue(undefined as never);
    expect(
      admitBotSession(core, state.assignment, 'assignment', state.policy, state.approval),
    ).toMatch(/snapshot is missing/);
  });

  it('admits an Orchestrator whose working directory is a symlink to its Memory directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-memory-cwd-'));
    try {
      const memory = join(root, 'home', 'bots', botSlug, 'memory');
      mkdirSync(memory, { recursive: true });
      symlinkSync(join(root, 'home'), join(root, 'linked-home'), 'dir');
      const state = fixture();
      state.memoryDirFor.mockReturnValue(memory);
      const spelled = (cwd: string) =>
        ({ id: 'botharness-orchestrator', header: { cwd } }) as never;
      for (const cwd of [join(root, 'linked-home', 'bots', botSlug, 'memory'), memory + '/']) {
        expect(
          grantExecutionDenial(state.core, spelled(cwd), state.policy, state.approval),
        ).toBeUndefined();
        expect(
          admitBotSession(state.core, spelled(cwd), 'orchestrator', state.policy, state.approval),
        ).toBeUndefined();
      }
      const other = join(root, 'other-memory');
      mkdirSync(other);
      expect(
        grantExecutionDenial(state.core, spelled(other), state.policy, state.approval),
      ).toMatch(/requires its Memory working directory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lets the Host borrow a native Assignment whose mode drifted from its snapshot', () => {
    const state = fixture();
    const appended: Array<[string, unknown]> = [];
    const assignment = {
      id: assignmentSessionId,
      header: { cwd },
      append: (type: string, data: { mode?: string; policy?: string }) => {
        appended.push([type, data]);
        if (type === 'sandbox/mode') state.resolvePolicy.mockReturnValue({ mode: data.mode! });
        if (type === 'approval/policy') state.overrideOf.mockReturnValue(data.policy!);
      },
    } as never;
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    state.overrideOf.mockReturnValue('never');
    expect(grantExecutionDenial(state.core, assignment, state.policy, state.approval)).toMatch(
      /differs from its snapshot/,
    );
    expect(
      admitBotSession(state.core, assignment, 'assignment', state.policy, state.approval),
    ).toBeUndefined();
    expect(appended).toEqual([
      ['sandbox/mode', { mode: 'workspace-write' }],
      ['approval/policy', { policy: 'ask' }],
    ]);
    expect(alignAssignmentPermission(state.core, assignment, state.policy, state.approval)).toBe(
      false,
    );
  });

  it('keeps refusing a drifted Assignment whose Grant or working directory no longer matches', () => {
    const state = fixture();
    const append = vi.fn();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    const moved = { id: assignmentSessionId, header: { cwd: '/tmp/elsewhere' }, append } as never;
    expect(admitBotSession(state.core, moved, 'assignment', state.policy, state.approval)).toMatch(
      /snapshot is missing or mismatched/,
    );
    const assignment = { id: assignmentSessionId, header: { cwd }, append } as never;
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      admitBotSession(state.core, assignment, 'assignment', state.policy, state.approval),
    ).toMatch(/Workspace Grant is missing, revoked, or unavailable/);
    expect(append).not.toHaveBeenCalled();
  });

  it('runs a workspace-write Assignment read-only while its Grant does not allow Bot writes (#4580)', () => {
    const state = fixture();
    let writable = false;
    state.requireActive.mockImplementation(() => ({
      id: grantId,
      workspaceId: 'workspace-1',
      workspacePath: cwd,
      orchestratorWrite: writable,
    }));
    const append = vi.fn();
    const assignment = { id: assignmentSessionId, header: { cwd }, append } as never;
    expect(
      admitBotSession(state.core, assignment, 'assignment', state.policy, state.approval),
    ).toMatch(/permission mode differs from its snapshot/);
    expect(append).toHaveBeenCalledWith('sandbox/mode', { mode: 'read-only' });
    state.resolvePolicy.mockReturnValue({ mode: 'read-only' });
    expect(
      admitBotSession(state.core, assignment, 'assignment', state.policy, state.approval),
    ).toBeUndefined();
    writable = true;
    append.mockClear();
    expect(alignAssignmentPermission(state.core, assignment, state.policy, state.approval)).toBe(
      true,
    );
    expect(append).toHaveBeenCalledWith('sandbox/mode', { mode: 'workspace-write' });
    state.resolvePolicy.mockReturnValue({ mode: 'workspace-write' });
    expect(
      admitBotSession(state.core, assignment, 'assignment', state.policy, state.approval),
    ).toBeUndefined();
  });

  it('leaves delegated Assignment Subagents to their own snapshot check', () => {
    const state = fixture();
    const core = {
      ...(state.core as object),
      ownership: {
        resolve: (sessionId: string) =>
          sessionId === 'assignment-child'
            ? {
                sessionId,
                botSlug,
                rootRole: 'assignment',
                provenance: 'subagent',
                parentSessionId: assignmentSessionId,
              }
            : { sessionId, botSlug, rootRole: 'assignment' },
      },
    } as never;
    const append = vi.fn();
    const child = {
      id: 'assignment-child',
      header: { cwd, parentSession: assignmentSessionId },
      append,
    } as never;
    expect(alignAssignmentPermission(core, child, state.policy, state.approval)).toBeUndefined();
    expect(append).not.toHaveBeenCalled();
  });
});

describe('Bot Session admission', () => {
  type Role = 'orchestrator' | 'assignment';
  type Entry = (
    state: ReturnType<typeof fixture>,
    core: never,
    session: never,
    role: Role,
  ) => string | undefined;
  const admitStep = (state: ReturnType<typeof fixture>, core: never, session: never) =>
    admitBotSession(core, session, undefined, state.policy, state.approval);
  const ENTRY_PATHS: ReadonlyArray<readonly [string, Entry]> = [
    ['create', (state, core, session) => admitStep(state, core, session)],
    ['resume', (state, core, session) => admitStep(state, core, session)],
    [
      'borrow',
      (state, core, session, role) =>
        borrowedAgentDenial(core, session, role) ?? admitStep(state, core, session),
    ],
    ['native wake', (state, core, session) => admitStep(state, core, session)],
  ];
  const memoryRoot = mkdtempSync(join(tmpdir(), 'botharness-admission-'));
  const memory = join(memoryRoot, 'home', 'bots', botSlug, 'memory');
  mkdirSync(memory, { recursive: true });
  symlinkSync(join(memoryRoot, 'home'), join(memoryRoot, 'linked-home'), 'dir');
  afterAll(() => rmSync(memoryRoot, { recursive: true, force: true }));
  const STATES: ReadonlyArray<{
    name: string;
    role: Role;
    access: 'workspace-write' | 'danger-full-access';
    mode: string;
    approval: string;
    cwd?: string;
  }> = [
    {
      name: 'Full access switched on while DSH held the Session',
      role: 'orchestrator',
      access: 'danger-full-access',
      mode: 'workspace-write',
      approval: 'ask',
    },
    {
      name: 'Full access switched off while DSH held the Session',
      role: 'orchestrator',
      access: 'workspace-write',
      mode: 'danger-full-access',
      approval: 'ask',
    },
    {
      name: 'Orchestrator approval policy changed inside the Session',
      role: 'orchestrator',
      access: 'workspace-write',
      mode: 'workspace-write',
      approval: 'never',
    },
    {
      name: 'Memory path spelled through a symlink',
      role: 'orchestrator',
      access: 'workspace-write',
      mode: 'workspace-write',
      approval: 'ask',
      cwd: join(memoryRoot, 'linked-home', 'bots', botSlug, 'memory'),
    },
    {
      name: 'Assignment mode changed outside its snapshot',
      role: 'assignment',
      access: 'workspace-write',
      mode: 'danger-full-access',
      approval: 'never',
    },
  ];
  const cases = STATES.flatMap((state) =>
    ENTRY_PATHS.map(([path, entry]) => ({ ...state, path, entry })),
  );

  it.each(cases)('repairs "$name" on $path before it checks', (testCase) => {
    const state = fixture();
    state.memoryDirFor.mockReturnValue(memory);
    state.resolvePolicy.mockReturnValue({ mode: testCase.mode });
    state.overrideOf.mockReturnValue(testCase.approval);
    const core = {
      ...(state.core as object),
      assignmentAccess: {
        get: () => ({ botSlug, mode: testCase.access, scope: 'chat', revision: 1 }),
      },
    } as never;
    const writes: string[] = [];
    const session = {
      id: testCase.role === 'orchestrator' ? 'botharness-orchestrator' : assignmentSessionId,
      header: { cwd: testCase.cwd ?? (testCase.role === 'orchestrator' ? memory : cwd) },
      append: (type: string, data: { mode?: string; policy?: string }) => {
        writes.push(type);
        if (type === 'sandbox/mode') state.resolvePolicy.mockReturnValue({ mode: data.mode! });
        if (type === 'approval/policy') state.overrideOf.mockReturnValue(data.policy!);
      },
    } as never;

    expect(testCase.entry(state, core, session, testCase.role)).toBeUndefined();
    expect(grantExecutionDenial(core, session, state.policy, state.approval)).toBeUndefined();
    const repaired = writes.length;
    expect(admitStep(state, core, session)).toBeUndefined();
    expect(writes).toHaveLength(repaired);
  });

  it('leaves every refusal after ownership and role to admission, which names the fix', () => {
    const state = fixture();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    const assignment = { id: assignmentSessionId, header: { cwd }, append: vi.fn() } as never;
    expect(borrowedAgentDenial(state.core, assignment, 'assignment')).toBeUndefined();
    expect(borrowedAgentDenial(state.core, assignment, 'orchestrator')).toBe(
      'BotHarness Agent role mismatch',
    );
    const denial = admitBotSession(
      state.core,
      assignment,
      'assignment',
      state.policy,
      state.approval,
    );
    expect(denial).toBe('Assignment Workspace Grant is missing, revoked, or unavailable');
    expect(sessionRefusalMessage(denial!)).toMatch(/^GRANT_UNAVAILABLE: .*Authorize the folder/);
  });

  it('reports each repair it made', () => {
    const state = fixture();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    const repairs: string[] = [];
    const assignment = { id: assignmentSessionId, header: { cwd }, append: vi.fn() } as never;
    admitBotSession(state.core, assignment, undefined, state.policy, state.approval, (repair) =>
      repairs.push(repair),
    );
    expect(repairs).toEqual(['assignment']);
  });
});
