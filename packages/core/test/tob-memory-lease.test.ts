import { afterEach, describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTobMemoryLeases, type TobMemoryLeaseDeps } from '../src/tob/memory-lease.js';
import {
  createTobAssignmentLeaseOperations,
  createTobMemoryLeaseOperations,
  TOB_ASSIGNMENT_LEASE_CAPABILITIES,
} from '../src/tob/cli-memory-lease-operations.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const AT = '2026-11-23T00:00:00.000Z';
const HEAD_ADA = 'a'.repeat(40);
const HEAD_BOB = 'b'.repeat(40);

type Bot = {
  slug: string;
  createdAt: string;
  ownerHumanId?: string;
  paused?: boolean;
};

const closers: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

function fixture() {
  const home = createTempRoot('tob-memory-lease-');
  const owner = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  closers.push(() => owner.close());
  const port = attachOperationalModule(owner, 'tob');
  const bots = new Map<string, Bot>([
    ['tob', { slug: 'tob', createdAt: AT }],
    ['ada', { slug: 'ada', createdAt: AT }],
    ['bob', { slug: 'bob', createdAt: AT }],
    ['eve', { slug: 'eve', createdAt: AT, ownerHumanId: 'someone-else' }],
  ]);
  const sessions = new Map<string, { botSlug: string; rootRole: string }>([
    ['asg-1', { botSlug: 'tob', rootRole: 'assignment' }],
    ['orc-1', { botSlug: 'tob', rootRole: 'orchestrator' }],
  ]);
  const files: Record<string, Record<string, string>> = {
    ada: {
      'SOUL.md': 'Ada is careful.\n',
      'MEMORY.md': 'Ada remembers releases.\n',
    },
    bob: {
      'SOUL.md': 'Bob is quick.\n',
      'MEMORY.md': 'Bob remembers designs.\n',
    },
  };
  const heads: Record<string, string> = { ada: HEAD_ADA, bob: HEAD_BOB };
  port.transaction((db) => {
    db.prepare(
      `INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at)
       VALUES ('asg-1', 'tob', 'assignment', ?)`,
    ).run(AT);
    db.prepare(
      `INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, channel_id)
       VALUES ('src-1', 'human-message', 'tob', 'compare Ada and Bob', ?, 'dm-tob')`,
    ).run(AT);
    db.prepare(
      `INSERT INTO assignments (session_id, source_event_id, bot_slug, activity,
         created_at, updated_at, title, description)
       VALUES ('asg-1', 'src-1', 'tob', 'working', ?, ?, 'Compare', 'Compare two Bots')`,
    ).run(AT, AT);
  });
  const deps: TobMemoryLeaseDeps = {
    database: port,
    registry: { get: (slug: string) => bots.get(slug) as never },
    ownership: {
      resolve: (id: string) => sessions.get(id) as never,
      contentAvailable: () => true,
    },
    memory: () => ({
      snapshot: (slug: string) => ({
        head: heads[slug]!,
        files: Object.keys(files[slug]!),
        provisional: false,
        standing: [],
      }),
      readAccepted: (slug: string, path: string) =>
        files[slug]?.[path] === undefined
          ? undefined
          : { path, body: files[slug]![path]!, head: heads[slug]! },
      history: (slug: string) => [
        {
          botSlug: slug,
          sha: heads[slug]!,
          parentSha: null,
          actorKind: 'human' as const,
          actorId: 'local-human',
          causeKind: 'human-edit' as const,
          causeId: 'edit',
          validationResult: 'ok',
          acceptedAt: AT,
        },
      ],
      diff: (_slug: string, sha: string) => ({ sha, diff: '+line\n' }),
    }),
    isTob: (slug: string) => slug === 'tob',
    now: () => new Date(AT),
  };
  const leases = createTobMemoryLeases(deps);
  const grant = (bots: string[] = ['ada', 'bob'], leaseKey = 'compare-1') =>
    leases.grant({
      tobSlug: 'tob',
      leaseKey,
      assignmentSessionId: 'asg-1',
      sourceEventIds: ['src-1'],
      bots,
    });
  return { port, bots, sessions, files, heads, deps, leases, grant };
}

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof TobError ? error.code : String(error);
  }
  return undefined;
}

describe('Tob Assignment read-only Memory lease', () => {
  it('compares two selected Bots and reports bounded revision provenance', () => {
    const f = fixture();
    const lease = f.grant();
    expect(lease).toMatchObject({
      state: 'active',
      status: 'partial',
      access: 'read-only',
      assignment: 'asg-1',
      sourceEvents: 1,
      bots: [
        { slug: 'ada', status: 'unread' },
        { slug: 'bob', status: 'unread' },
      ],
    });
    const ada = f.leases.read({
      assignmentSessionId: 'asg-1',
      bot: 'ada',
      kind: 'file',
      path: 'SOUL.md',
    });
    const bob = f.leases.read({
      assignmentSessionId: 'asg-1',
      bot: 'bob',
      kind: 'file',
      path: 'SOUL.md',
    });
    expect(ada.value).toEqual({
      path: 'SOUL.md',
      exists: true,
      body: 'Ada is careful.\n',
      truncated: false,
    });
    expect(ada.provenance).toMatchObject({
      seq: 1,
      bot: 'ada',
      path: 'SOUL.md',
      revision: HEAD_ADA,
      truncated: false,
      outcome: 'ok',
    });
    expect(bob.provenance).toMatchObject({ seq: 2, revision: HEAD_BOB });
    const [view] = f.leases.list({ tobSlug: 'tob' });
    expect(view).toMatchObject({
      status: 'complete',
      bots: [
        { slug: 'ada', status: 'read', revision: HEAD_ADA, reads: 1 },
        { slug: 'bob', status: 'read', revision: HEAD_BOB, reads: 1 },
      ],
      readCount: 2,
    });
    const footer = f.leases.reportFooter('asg-1')!;
    expect(footer).toContain(`ada: read at ${HEAD_ADA}`);
    expect(footer).toContain(`bob: read at ${HEAD_BOB}`);
    expect(footer.length).toBeLessThanOrEqual(1200);
  });

  it('refuses writes, unlisted targets and commands outside the lease', () => {
    const f = fixture();
    f.grant(['ada']);
    expect(
      code(() =>
        f.leases.read({
          assignmentSessionId: 'asg-1',
          bot: 'bob',
          kind: 'file',
          path: 'SOUL.md',
        }),
      ),
    ).toBe('lease-target-denied');
    expect(
      code(() =>
        f.leases.read({
          assignmentSessionId: 'asg-1',
          bot: 'ada',
          kind: 'save',
        }),
      ),
    ).toBe('lease-read-only');
    const prepare = createTobAssignmentLeaseOperations({
      leases: () => f.leases,
      assignmentSessionId: 'asg-1',
    });
    const cli = (argv: string[]) => () =>
      prepare('cli', { argv, stdin: '', cwd: '/tmp' }) as unknown;
    expect(code(cli(['memory-save', 'ada', '--path', 'SOUL.md', '--body', 'x']))).toBe(
      'lease-read-only',
    );
    expect(code(cli(['memory-restore-commit', 'ada', '--sha', HEAD_ADA]))).toBe('lease-read-only');
    expect(code(cli(['update', 'ada', '--name', 'Eve']))).toBe('tob-authority-required');
    expect(code(cli(['memory-file', 'ada', '--path', 'SOUL.md', '--out', '/tmp/x']))).toBe(
      'lease-read-only',
    );
    expect(code(() => prepare('settings-set', {}))).toBe('lease-read-only');
    expect(f.leases.list({ tobSlug: 'tob' })[0]!.readCount).toBe(0);
  });

  it('refuses archived or replaced targets and keeps the partial status', () => {
    const f = fixture();
    f.grant();
    f.leases.read({
      assignmentSessionId: 'asg-1',
      bot: 'ada',
      kind: 'snapshot',
    });
    f.bots.set('bob', { slug: 'bob', createdAt: AT, paused: true });
    expect(
      code(() =>
        f.leases.read({
          assignmentSessionId: 'asg-1',
          bot: 'bob',
          kind: 'snapshot',
        }),
      ),
    ).toBe('lease-target-unavailable');
    f.bots.set('bob', { slug: 'bob', createdAt: '2026-11-24T00:00:00.000Z' });
    expect(
      code(() =>
        f.leases.read({
          assignmentSessionId: 'asg-1',
          bot: 'bob',
          kind: 'snapshot',
        }),
      ),
    ).toBe('lease-target-unavailable');
    const view = f.leases.active('asg-1')!;
    expect(view.status).toBe('partial');
    expect(view.bots).toMatchObject([
      { slug: 'ada', status: 'read' },
      { slug: 'bob', status: 'refused', reads: 0 },
    ]);
    expect(f.leases.reportFooter('asg-1')).toContain('bob: refused');
  });

  it('ends with revocation, a purged source request or an archived Assignment', () => {
    const revoked = fixture();
    const lease = revoked.grant();
    expect(revoked.leases.revoke({ tobSlug: 'tob', leaseId: lease.leaseId }).state).toBe('revoked');
    expect(
      code(() =>
        revoked.leases.read({
          assignmentSessionId: 'asg-1',
          bot: 'ada',
          kind: 'snapshot',
        }),
      ),
    ).toBe('lease-unavailable');

    const purged = fixture();
    purged.grant();
    purged.port.transaction((db) => {
      db.prepare(
        `INSERT INTO messaging_purge_facts (source_event_id, channel_id, message_id, accepted_at, tombstone_json)
         VALUES ('src-1', 'dm-tob', 'm-1', ?, '{}')`,
      ).run(AT);
    });
    expect(
      code(() =>
        purged.leases.read({
          assignmentSessionId: 'asg-1',
          bot: 'ada',
          kind: 'snapshot',
        }),
      ),
    ).toBe('lease-source-revoked');
    expect(purged.leases.active('asg-1')!.state).toBe('expired');

    const archived = fixture();
    archived.grant();
    archived.port.transaction((db) => {
      db.prepare(`UPDATE assignments SET archived_at = ? WHERE session_id = 'asg-1'`).run(AT);
    });
    expect(
      code(() =>
        archived.leases.read({
          assignmentSessionId: 'asg-1',
          bot: 'ada',
          kind: 'snapshot',
        }),
      ),
    ).toBe('lease-expired');
  });

  it('keeps the lease and its provenance across a resumed Assignment', () => {
    const f = fixture();
    f.grant();
    f.leases.read({
      assignmentSessionId: 'asg-1',
      bot: 'ada',
      kind: 'file',
      path: 'MEMORY.md',
    });
    const resumed = createTobMemoryLeases(f.deps);
    expect(resumed.active('asg-1')).toMatchObject({
      readCount: 1,
      state: 'active',
    });
    resumed.read({ assignmentSessionId: 'asg-1', bot: 'bob', kind: 'history' });
    expect(resumed.reportFooter('asg-1')).toContain('(active, complete, read-only)');
    expect(resumed.active('asg-1')).toMatchObject({
      status: 'complete',
      readCount: 2,
    });
  });

  it('binds the grant to the request, an owned Assignment and owned Bots', () => {
    const f = fixture();
    expect(code(() => f.grant(['eve']))).toBe('permission-required');
    expect(code(() => f.grant(['nobody']))).toBe('unknown-bot');
    expect(
      code(() =>
        f.leases.grant({
          tobSlug: 'tob',
          leaseKey: 'k',
          assignmentSessionId: 'orc-1',
          sourceEventIds: ['src-1'],
          bots: ['ada'],
        }),
      ),
    ).toBe('unknown-assignment');
    expect(
      code(() =>
        f.leases.grant({
          tobSlug: 'tob',
          leaseKey: 'k',
          assignmentSessionId: 'asg-1',
          sourceEventIds: [],
          bots: ['ada'],
        }),
      ),
    ).toBe('human-dm-required');
    expect(
      code(() =>
        f.leases.grant({
          tobSlug: 'tob',
          leaseKey: 'k',
          assignmentSessionId: 'asg-1',
          sourceEventIds: ['missing'],
          bots: ['ada'],
        }),
      ),
    ).toBe('lease-source-revoked');
    const first = f.grant();
    expect(f.grant().leaseId).toBe(first.leaseId);
    expect(code(() => f.grant(['ada']))).toBe('lease-key-conflict');
    expect(code(() => f.grant(['ada'], 'compare-2'))).toBe('lease-exists');
  });

  it('runs the Tob grant and the Assignment reads through the scoped CLI broker', async () => {
    const f = fixture();
    const signal = new AbortController();
    closers.push(() => signal.abort());
    const tob = await startTobCliBroker({
      signal: signal.signal,
      authorize() {},
      readSetting: () => ({ scope: 'global', value: 3, revision: 1 }) as never,
      writeSetting: async () => {
        throw new Error('unexpected write');
      },
      approve: async () => {
        throw new Error('unexpected approval');
      },
      prepareOperation: createTobMemoryLeaseOperations({
        leases: () => f.leases,
        tobSlug: () => 'tob',
        sources: () => ['src-1'],
      }),
      capabilities: [],
    });
    closers.push(() => tob.close());
    const assignment = await startTobCliBroker({
      signal: signal.signal,
      authorize() {
        if (!f.leases.active('asg-1')) throw new TobError('lease-unavailable');
      },
      readSetting: () => {
        throw new TobError('lease-read-only');
      },
      writeSetting: async () => {
        throw new TobError('lease-read-only');
      },
      approve: async () => {
        throw new TobError('lease-read-only');
      },
      prepareOperation: createTobAssignmentLeaseOperations({
        leases: () => f.leases,
        assignmentSessionId: 'asg-1',
      }),
      capabilities: TOB_ASSIGNMENT_LEASE_CAPABILITIES,
    });
    closers.push(() => assignment.close());
    const cli = async (broker: { endpoint: string; token: string }, argv: string[]) => {
      const out: string[] = [];
      const exitCode = await runBotCreateCli(argv, {
        env: {
          DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint + '/',
          DEEPSEEKBOT_AGENT_TOKEN: broker.token,
        },
        stdout: (text) => out.push(text),
        stderr: () => {},
        readStdin: async () => '',
      });
      return {
        exitCode,
        value: JSON.parse(out.join('\n')) as Record<string, unknown>,
      };
    };
    const granted = await cli(tob, [
      'assignment-memory-lease',
      'asg-1',
      'ada',
      'bob',
      '--operation-key',
      'compare-1',
    ]);
    expect(granted.exitCode).toBe(0);
    expect(granted.value).toMatchObject({
      lease: { state: 'active', access: 'read-only' },
    });
    const read = await cli(assignment, ['memory-file', 'bob', '--path', 'SOUL.md']);
    expect(read.exitCode).toBe(0);
    expect(read.value).toMatchObject({
      bot: 'bob',
      kind: 'file',
      value: { body: 'Bob is quick.\n' },
      provenance: { revision: HEAD_BOB, path: 'SOUL.md' },
    });
    const write = await cli(assignment, [
      'memory-save',
      'bob',
      '--path',
      'SOUL.md',
      '--body',
      'x',
      '--expected-head',
      HEAD_BOB,
    ]);
    expect(write.exitCode).not.toBe(0);
    expect(JSON.stringify(write.value)).toContain('lease-read-only');
    const status = await cli(assignment, ['assignment-memory-leases']);
    expect(status.value).toMatchObject({ lease: { readCount: 1 } });
    const leaseId = (granted.value as { lease: { leaseId: string } }).lease.leaseId;
    expect((await cli(tob, ['assignment-memory-revoke', leaseId])).value).toMatchObject({
      lease: { state: 'revoked' },
    });
    const after = await cli(assignment, ['memory-file', 'ada', '--path', 'SOUL.md']);
    expect(after.exitCode).not.toBe(0);
    expect(JSON.stringify(after.value)).toContain('lease-unavailable');
  });
});
