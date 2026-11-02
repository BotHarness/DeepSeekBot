import { describe, expect, it } from 'vitest';

import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import {
  createSessionOwnership,
  SessionOwnershipConflictError,
  type SessionOwnership,
} from '../src/sessions/ownership.js';
import { createTempRoot } from './helpers.js';

function mount(home: string): OperationalDatabaseOwner {
  return mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
}

function setup(): { home: string; owner: OperationalDatabaseOwner; ownership: SessionOwnership } {
  const home = createTempRoot('botharness-ownership-');
  const owner = mount(home);
  return {
    home,
    owner,
    ownership: createSessionOwnership(attachOperationalModule(owner, 'session-ownership')),
  };
}

const AT = '2026-09-21T00:00:00.000Z';

describe('Session ownership', () => {
  it('claims and resolves a root Session with its explicit run configuration', () => {
    const { owner, ownership } = setup();

    const claimed = ownership.claim({
      sessionId: 'session-1',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      cwdReference: '/memory/ada',
      at: AT,
    });

    expect(claimed).toEqual({
      sessionId: 'session-1',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      provenance: 'created',
      parentSessionId: undefined,
      cwdReference: '/memory/ada',
      createdAt: AT,
    });
    expect(ownership.resolve('session-1')).toEqual(claimed);
    owner.close();
  });

  it('treats an identical claim as idempotent and rejects a conflicting one', () => {
    const { owner, ownership } = setup();
    ownership.claim({ sessionId: 'session-1', botSlug: 'ada', rootRole: 'assignment', at: AT });

    expect(
      ownership.claim({ sessionId: 'session-1', botSlug: 'ada', rootRole: 'assignment', at: AT }),
    ).toMatchObject({ botSlug: 'ada', rootRole: 'assignment' });
    expect(() =>
      ownership.claim({ sessionId: 'session-1', botSlug: 'bob', rootRole: 'assignment', at: AT }),
    ).toThrow(SessionOwnershipConflictError);
    expect(() =>
      ownership.claim({ sessionId: 'session-1', botSlug: 'ada', rootRole: 'orchestrator', at: AT }),
    ).toThrow(/owned by ada as assignment/);
    expect(ownership.list()).toHaveLength(1);
    owner.close();
  });

  it('fails closed for an unknown Session and an unknown parent', () => {
    const { owner, ownership } = setup();

    expect(ownership.resolve('nobody')).toBeUndefined();
    expect(() =>
      ownership.claim({
        sessionId: 'child',
        botSlug: 'ada',
        rootRole: 'assignment',
        provenance: 'fork',
        parentSessionId: 'missing-parent',
        at: AT,
      }),
    ).toThrow(/Unknown parent Session ownership/);
    owner.close();
  });

  it('lists roots per PersonaBot and role, newest first, without descendants', () => {
    const { owner, ownership } = setup();
    ownership.claim({ sessionId: 'orch-1', botSlug: 'ada', rootRole: 'orchestrator', at: AT });
    ownership.claim({
      sessionId: 'assignment-old',
      botSlug: 'ada',
      rootRole: 'assignment',
      at: '2026-09-21T00:01:00.000Z',
    });
    ownership.claim({
      sessionId: 'assignment-new',
      botSlug: 'ada',
      rootRole: 'assignment',
      at: '2026-09-21T00:02:00.000Z',
    });
    ownership.claim({
      sessionId: 'forked',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'assignment-new',
      at: '2026-09-21T00:03:00.000Z',
    });
    ownership.claim({ sessionId: 'bob-root', botSlug: 'bob', rootRole: 'assignment', at: AT });

    expect(ownership.rootsFor('ada', 'orchestrator').map((record) => record.sessionId)).toEqual([
      'orch-1',
    ]);
    expect(ownership.rootsFor('ada', 'assignment').map((record) => record.sessionId)).toEqual([
      'assignment-new',
      'assignment-old',
    ]);
    expect(ownership.rootsFor('bob').map((record) => record.sessionId)).toEqual(['bob-root']);
    owner.close();
  });

  it('walks fork and Subagent lineage from an owned root', () => {
    const { owner, ownership } = setup();
    ownership.claim({ sessionId: 'root', botSlug: 'ada', rootRole: 'orchestrator', at: AT });
    ownership.claim({
      sessionId: 'fork',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'root',
      at: '2026-09-21T00:01:00.000Z',
    });
    ownership.claim({
      sessionId: 'subagent',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'subagent',
      parentSessionId: 'fork',
      at: '2026-09-21T00:02:00.000Z',
    });

    expect(ownership.descendantsOf('root').map((record) => record.sessionId)).toEqual([
      'fork',
      'subagent',
    ]);
    expect(ownership.descendantsOf('subagent')).toEqual([]);
    ownership.claim({ sessionId: 'other', botSlug: 'ada', rootRole: 'assignment', at: AT });
    expect([...ownership.subagentCounts(['root', 'other', 'fork'])]).toEqual(
      expect.arrayContaining([
        ['root', 1],
        ['fork', 1],
      ]),
    );
    expect(ownership.subagentCounts(['root', 'other', 'fork']).has('other')).toBe(false);
    expect(ownership.subagentCounts([]).size).toBe(0);
    expect(ownership.resolve('subagent')).toMatchObject({
      provenance: 'subagent',
      parentSessionId: 'fork',
      rootRole: 'assignment',
    });
    owner.close();
  });

  it('repairs ownership explicitly and audits the change', () => {
    const { owner, ownership } = setup();
    ownership.claim({ sessionId: 'session-1', botSlug: 'ada', rootRole: 'assignment', at: AT });

    const repaired = ownership.repair({
      sessionId: 'session-1',
      botSlug: 'bob',
      rootRole: 'orchestrator',
      cwdReference: '/memory/bob',
      at: '2026-09-21T00:05:00.000Z',
    });

    expect(repaired).toMatchObject({
      sessionId: 'session-1',
      botSlug: 'bob',
      rootRole: 'orchestrator',
      provenance: 'repair',
      cwdReference: '/memory/bob',
    });
    const created = ownership.repair({
      sessionId: 'recovered',
      botSlug: 'ada',
      rootRole: 'assignment',
      at: '2026-09-21T00:06:00.000Z',
    });
    expect(created).toMatchObject({ sessionId: 'recovered', provenance: 'repair' });
    owner.close();
  });

  it('freezes one persona snapshot per Session and clears it only on re-owning', () => {
    const { owner, ownership } = setup();
    ownership.claim({ sessionId: 'session-1', botSlug: 'ada', rootRole: 'orchestrator', at: AT });
    ownership.claim({ sessionId: 'session-2', botSlug: 'ada', rootRole: 'orchestrator', at: AT });

    expect(ownership.personaSnapshot('session-1')).toBeUndefined();
    expect(ownership.personaSnapshot('nobody')).toBeUndefined();
    expect(ownership.recordPersonaSnapshot('session-1', '# Persona v1\n', AT)).toEqual({
      body: '# Persona v1\n',
      recordedAt: AT,
    });
    expect(ownership.recordPersonaSnapshot('session-1', '# Persona v2\n', 'later')).toEqual({
      body: '# Persona v1\n',
      recordedAt: AT,
    });
    expect(ownership.personaSnapshot('session-1')?.body).toBe('# Persona v1\n');
    expect(ownership.recordPersonaSnapshot('session-2', '', AT)).toEqual({
      body: '',
      recordedAt: AT,
    });
    expect(ownership.personaSnapshot('session-2')?.body).toBe('');

    ownership.repair({
      sessionId: 'session-1',
      botSlug: 'bob',
      rootRole: 'orchestrator',
      at: '2026-09-21T00:05:00.000Z',
    });
    expect(ownership.personaSnapshot('session-1')).toBeUndefined();
    expect(ownership.recordPersonaSnapshot('session-1', '# Bob\n', 'bob-at').body).toBe('# Bob\n');

    ownership.repair({
      sessionId: 'session-1',
      botSlug: 'bob',
      rootRole: 'assignment',
      at: '2026-09-21T00:06:00.000Z',
    });
    expect(ownership.personaSnapshot('session-1')?.body).toBe('# Bob\n');

    expect(() => ownership.recordPersonaSnapshot('nobody', 'x', AT)).toThrow(
      /Unknown Session ownership/,
    );
    owner.close();
  });

  it('migrates a generation-5 table in place and keeps legacy rows claimable', () => {
    const home = createTempRoot('botharness-ownership-migration-');
    const v5Plan = defineSchemaPlan(BOT_HARNESS_SCHEMA_PLAN.migrations.slice(0, 4));
    expect(v5Plan.targetGeneration).toBe(5);
    const legacyOwner = mountOperationalDatabase({ dshHome: home, schemaPlan: v5Plan });
    attachOperationalModule(legacyOwner, 'session-ownership-test').transaction((database) => {
      database
        .prepare(
          `INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at)
           VALUES ('legacy-1', 'ada', 'orchestrator', ?)`,
        )
        .run(AT);
    });
    legacyOwner.close();

    const migrated = mount(home);
    expect(migrated.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
    const ownership = createSessionOwnership(
      attachOperationalModule(migrated, 'session-ownership'),
    );

    expect(ownership.resolve('legacy-1')).toEqual({
      sessionId: 'legacy-1',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      provenance: 'legacy',
      parentSessionId: undefined,
      cwdReference: undefined,
      createdAt: AT,
    });
    expect(
      ownership.claim({ sessionId: 'legacy-1', botSlug: 'ada', rootRole: 'orchestrator', at: AT }),
    ).toMatchObject({ provenance: 'legacy' });
    expect(() =>
      ownership.claim({ sessionId: 'legacy-1', botSlug: 'bob', rootRole: 'orchestrator', at: AT }),
    ).toThrow(SessionOwnershipConflictError);
    migrated.close();
  });

  it('rebuilds from the durable table after a restart', () => {
    const { home, owner, ownership } = setup();
    ownership.claim({
      sessionId: 'session-1',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      cwdReference: '/memory/ada',
      at: AT,
    });
    owner.close();

    const reopened = mount(home);
    const restarted = createSessionOwnership(
      attachOperationalModule(reopened, 'session-ownership'),
    );

    expect(restarted.resolve('session-1')).toMatchObject({
      botSlug: 'ada',
      rootRole: 'orchestrator',
      cwdReference: '/memory/ada',
    });
    expect(restarted.list()).toHaveLength(1);
    reopened.close();
  });
});
