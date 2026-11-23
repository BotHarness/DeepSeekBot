import { vi, type Mock } from 'vitest';

export const botSlug: 'ada' = 'ada';

export const assignmentSessionId: 'botharness-assignment' = 'botharness-assignment';

export const grantId: 'grant-1' = 'grant-1';

export const cwd: '/tmp/grant-workspace' = '/tmp/grant-workspace';

interface GrantExecutionFixture {
  core: never;
  policy: never;
  approval: never;
  assignment: never;
  requireActive: Mock<
    () => { id: string; workspaceId: string; workspacePath: string; orchestratorWrite: boolean }
  >;
  resolvePolicy: Mock<() => { mode: string }>;
  getAssignment: Mock<
    () => {
      permission: {
        grantId: string;
        workspaceId: string;
        primaryCwd: string;
        mode: string;
        approval: string;
        presetRevision: number;
      };
    }
  >;
  overrideOf: Mock<() => string>;
  memoryDirFor: Mock<() => string>;
  getBot: Mock<() => { slug: string } | undefined>;
}

export function fixture(): GrantExecutionFixture {
  const resolve = vi.fn((sessionId: string) =>
    sessionId === assignmentSessionId
      ? {
          sessionId,
          botSlug,
          rootRole: 'assignment',
          parentSessionId: undefined,
        }
      : sessionId === 'botharness-orchestrator'
        ? {
            sessionId,
            botSlug,
            rootRole: 'orchestrator',
            parentSessionId: undefined,
          }
        : undefined,
  );
  const requireActive = vi.fn(() => ({
    id: grantId,
    workspaceId: 'workspace-1',
    workspacePath: cwd,
    orchestratorWrite: true as boolean,
  }));
  const getAssignment = vi.fn(() => ({
    permission: {
      grantId,
      workspaceId: 'workspace-1',
      primaryCwd: cwd,
      mode: 'workspace-write',
      approval: 'ask',
      presetRevision: 0,
    },
  }));
  const overrideOf = vi.fn(() => 'ask');
  const getBot = vi.fn((): { slug: string } | undefined => ({ slug: botSlug }));
  const memoryDirFor = vi.fn(() => '/tmp/memory');
  const core = {
    ownership: { resolve },
    runtime: { getAssignment },
    grants: { requireActive, list: () => [] },
    registry: { memoryDirFor, get: getBot },
    hostTools: new Set<string>(),
  } as never;
  const resolvePolicy = vi.fn(() => ({ mode: 'workspace-write' }));
  const policy = { resolve: resolvePolicy } as never;
  const approval = { overrideOf } as never;
  const assignment = { id: assignmentSessionId, header: { cwd } } as never;
  return {
    core,
    policy,
    approval,
    assignment,
    requireActive,
    resolvePolicy,
    getAssignment,
    overrideOf,
    memoryDirFor,
    getBot,
  };
}
