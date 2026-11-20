import type { ConfinementStatus } from '../src/execution/linux-confinement.js';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { Service } from '@deepseek-ai/cordis';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { afterEach, describe, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import {
  grantExecutionDenial,
  grantToolExecutionDenial,
  orchestratorPermission,
  sessionHasFullAccess,
} from '../src/workspaces/grant-execution.js';
import { SandboxPolicyService, setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { ApprovalService, setApprovalPolicy } from '@deepseek-ai/dsh-user-approval';
import { alice, bob, fixture, cleanup } from './team-approvals-fixtures.js';

afterEach(cleanup);

describe('M5 approval projections and decisions', () => {
  it('exposes the trial isolation contract without changing the CLI status payload', async () => {
    const f = fixture();
    expect(await f.invoke(bob, 'teamMode', {})).toMatchObject({
      enabled: true,
      isolation: 'trial',
      viewer: { humanId: 'bob' },
    });
    expect(await f.invoke(owner, 'teamMode', {})).toMatchObject({
      isolation: 'trial',
      viewer: { kind: 'owner' },
    });
  });

  it('reports enforced isolation only while both file and network confinement are active', async () => {
    const f = fixture();
    let status: ConfinementStatus | undefined = {
      enforcement: 'full',
      filesystem: true,
      network: true,
      missing: [],
    };
    f.team.bindConfinement(() => status);
    expect(await f.invoke(owner, 'teamMode', {})).toMatchObject({
      isolation: 'enforced',
      confinement: { enforcement: 'full' },
    });
    const member = (await f.invoke(bob, 'teamMode', {})) as Record<string, unknown>;
    expect(member).toMatchObject({ isolation: 'enforced' });
    expect(member).not.toHaveProperty('confinement');
    status = { enforcement: 'partial', filesystem: true, network: false, missing: ['slirp4netns'] };
    expect(await f.invoke(owner, 'teamMode', {})).toMatchObject({
      isolation: 'trial',
      confinement: { missing: ['slirp4netns'] },
    });
    status = undefined;
    expect(await f.invoke(bob, 'teamMode', {})).toMatchObject({ isolation: 'trial' });
  });
});

describe('M5 configuration and execution fences', () => {
  it.each(['danger-full-access', 'never', 'escalation'] as const)(
    'refuses member Bot %s at the execution boundary',
    async (mode) => {
      const f = fixture();
      const sessionId = 'm5-execution';
      f.ownership.claim({
        sessionId,
        botSlug: 'alice-bot',
        rootRole: 'orchestrator',
        at: new Date().toISOString(),
      });
      const session = Session.create(SessionId(sessionId));
      setSandboxMode(
        session,
        mode === 'danger-full-access' ? 'danger-full-access' : 'workspace-write',
      );
      setApprovalPolicy(session, mode === 'never' ? 'never' : 'ask');
      new SessionProjectionRegistry(f.ctx);
      const policy = new SandboxPolicyService(f.ctx, { mode: 'workspace-write' });
      const approval = new ApprovalService(f.ctx, { policy: 'ask' });
      await policy[Service.init]();
      await approval[Service.init]();
      const core = {
        registry: f.registry,
        team: f.team,
        ownership: f.ownership,
        assignmentAccess: f.assignmentAccess,
        runtime: Object.assign(Object.create(null), { getAssignment: () => undefined }),
        grants: Object.assign(Object.create(null), {}),
        hostTools: new Set<string>(),
      };
      expect(orchestratorPermission(core, 'alice-bot')).toEqual({
        mode: 'workspace-write',
        approval: 'ask',
      });
      expect(sessionHasFullAccess(core, sessionId)).toBe(false);
      if (mode !== 'escalation')
        expect(grantExecutionDenial(core, session, policy, approval)).toBe('permission-required');
      else {
        const memory = f.registry.memoryDirFor('alice-bot');
        const run = Session.create(SessionId(sessionId), [], { ...session.header, cwd: memory! });
        setSandboxMode(run, 'workspace-write');
        setApprovalPolicy(run, 'ask');
        expect(
          grantToolExecutionDenial(
            core,
            run,
            policy,
            approval,
            'bash',
            { sandbox_permissions: 'require_escalated' },
            true,
          ),
        ).toBe('permission-required');
      }
    },
  );

  it.each(['chat', 'assignments'] as const)(
    'keeps dangerous %s access Owner-only and refuses member Bots even to the Owner',
    async (scope) => {
      const f = fixture();
      expect(
        f.methods(alice).assignmentAccessSet({
          slug: 'alice-bot',
          mode: 'danger-full-access',
          scope,
          acknowledgeRisk: true,
        }),
      ).toMatchObject({ ok: false, error: { code: 'owner-only' } });
      expect(
        f.methods(owner).assignmentAccessSet({
          slug: 'alice-bot',
          mode: 'danger-full-access',
          scope,
          acknowledgeRisk: true,
        }),
      ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
      expect(() => f.assignmentAccess.set('alice-bot', 'danger-full-access', scope, owner)).toThrow(
        'permission-required',
      );
      expect(() => f.assignmentAccess.set('owner-bot', 'danger-full-access', scope, alice)).toThrow(
        'owner-only',
      );
      expect(
        f.methods(owner).assignmentAccessSet({
          slug: 'owner-bot',
          mode: 'danger-full-access',
          scope,
          acknowledgeRisk: true,
        }),
      ).toMatchObject({ ok: true });
    },
  );
});
