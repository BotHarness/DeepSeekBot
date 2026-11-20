import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { SessionOwnershipRecord } from '../src/sessions/ownership.js';
import { orchestratorPermission, sessionHasFullAccess } from '../src/workspaces/grant-execution.js';

const MODES = ['workspace-write', 'danger-full-access'] as const;

const scene = fc.record({
  rootRole: fc.constantFrom('orchestrator', 'assignment'),
  preset: fc.option(
    fc.record({ mode: fc.constantFrom(...MODES), scope: fc.constantFrom('chat', 'assignments') }),
    { nil: undefined },
  ),
  snapshot: fc.option(fc.constantFrom(...MODES), { nil: undefined }),
  member: fc.boolean(),
  depth: fc.integer({ min: 0, max: 3 }),
  foreignAt: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
});

type Scene = typeof scene extends fc.Arbitrary<infer T> ? T : never;

function build(input: Scene) {
  const records = new Map<string, SessionOwnershipRecord>();
  const record = (
    sessionId: string,
    botSlug: string,
    rootRole: SessionOwnershipRecord['rootRole'],
    parentSessionId?: string,
  ) =>
    records.set(sessionId, {
      sessionId,
      botSlug,
      rootRole,
      provenance: parentSessionId === undefined ? 'created' : 'subagent',
      parentSessionId,
      cwdReference: undefined,
      createdAt: '2026-11-18T00:00:00.000Z',
    });
  record('root', 'ada', input.rootRole);
  let leaf = 'root';
  for (let level = 1; level <= input.depth; level += 1) {
    const id = `child-${level}`;
    record(id, input.foreignAt === level ? 'bo' : 'ada', input.rootRole, leaf);
    leaf = id;
  }
  const core = {
    ownership: { resolve: (id: string) => records.get(id) },
    runtime: {
      getAssignment: (botSlug: string, sessionId: string) =>
        botSlug === 'ada' && sessionId === 'root' && input.rootRole === 'assignment'
          ? { permission: input.snapshot && { mode: input.snapshot } }
          : undefined,
    },
    assignmentAccess: { get: (botSlug: string) => (botSlug === 'ada' ? input.preset : undefined) },
    registry: {
      get: (botSlug: string) => ({
        ownerHumanId:
          input.member && botSlug === 'ada' ? 'member-human' : OWNER_HUMAN_CONTEXT.humanId,
      }),
    },
  };
  return { core: core as never as Parameters<typeof sessionHasFullAccess>[0], leaf };
}

describe('full access follows the root Session (ADR-0193, ADR-0205, ADR-0260)', () => {
  it('gives the Orchestrator full access only for a chat-scoped full-access preset of an owner Bot', () => {
    fc.assert(
      fc.property(scene, (input) => {
        const { core } = build(input);
        const expected =
          !input.member &&
          input.preset?.mode === 'danger-full-access' &&
          input.preset.scope === 'chat';
        expect(orchestratorPermission(core, 'ada').mode).toBe(
          expected ? 'danger-full-access' : 'workspace-write',
        );
      }),
      { numRuns: 300 },
    );
  });

  it('gives a delegated Subagent full access exactly when its same-Bot root has it', () => {
    fc.assert(
      fc.property(scene, (input) => {
        const { core, leaf } = build(input);
        const rootFull =
          !input.member &&
          (input.rootRole === 'orchestrator'
            ? input.preset?.mode === 'danger-full-access' && input.preset.scope === 'chat'
            : input.snapshot === 'danger-full-access');
        const brokenChain = input.foreignAt !== undefined && input.foreignAt <= input.depth;
        expect(sessionHasFullAccess(core, leaf)).toBe(rootFull && !brokenChain);
        expect(sessionHasFullAccess(core, 'root')).toBe(rootFull);
      }),
      { numRuns: 500 },
    );
  });
});
