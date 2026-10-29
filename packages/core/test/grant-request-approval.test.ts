import { realpathSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

function fixture() {
  const workspace = {
    id: 'project',
    path: realpathSync(createTempRoot('botharness-request-project-')),
    title: 'Project',
    status: async () => 'ok' as const,
  };
  const core = createCore({
    dshHome: createTempRoot('botharness-request-home-'),
    workspaces: () => ({
      get: (id) => (id === workspace.id ? workspace : undefined),
      list: () => [workspace],
    }),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
    },
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const channel = core.channels.getOrCreateDm('ada', 'Ada')!;
  const methods = createBridgeMethods({ ...core });
  const payload = {
    slug: 'ada',
    channelId: channel.id,
    requestMessageId: 'request',
    workspaceId: workspace.id,
    acknowledgeReadWrite: true,
  };
  return {
    core,
    workspace,
    methods,
    payload,
    request: () =>
      core.channels.appendMessage(channel.id, {
        id: 'request',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Write a file',
        grantRequest: true,
        grantRequestOwner: core.registry.get('ada')!.createdAt,
      }),
    close: async () => {
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}

describe('Host workspace request approval', () => {
  it('publishes writable authority with the decision and accepts one concurrent decision', async () => {
    const f = fixture();
    try {
      await f.request();
      const published: boolean[] = [];
      f.core.operationalDatabase.subscribe((event) => {
        if (
          event.topics.includes('source-event') &&
          f.core.channels.grantRequestResolution?.(f.payload.channelId, 'request')
        )
          published.push(f.core.grants.list('ada')[0]?.orchestratorWrite === true);
      });
      const results = await Promise.all([
        f.methods.grantRequestApprove(f.payload),
        f.methods.grantRequestApprove(f.payload),
      ]);
      expect(results.every((result) => result.ok)).toBe(true);
      expect(f.core.grants.list('ada')).toHaveLength(1);
      expect(f.core.grants.list('ada')[0]).toMatchObject({
        orchestratorWrite: true,
        writeRevision: 1,
      });
      expect(
        f.core.channels
          .readMessages(f.payload.channelId)
          .filter((message) => message.grantRequestResolution),
      ).toHaveLength(1);
      expect(published).toContain(true);
      expect(published).not.toContain(false);
      const first = results[0];
      if (!first?.ok) throw new Error('Expected a committed approval');
      expect(await f.methods.grantRequestApprove(f.payload)).toMatchObject({
        ok: true,
        value: { grant: first.value.grant, message: { id: first.value.message.id } },
      });
      const grant = f.core.grants.list('ada')[0]!;
      f.core.grants.revoke('ada', grant.id);
      expect(await f.methods.grantRequestApprove(f.payload)).toMatchObject({
        ok: false,
        error: { code: 'invalid-grant' },
      });
      expect(f.core.grants.list('ada')).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  it.each([false, true])(
    'rolls back authority when Channel commit fails (legacy=%s)',
    async (legacy) => {
      const f = fixture();
      try {
        await f.request();
        if (legacy) await f.core.grants.create('ada', f.workspace.id);
        const append = f.core.channels.appendMessageOnce.bind(f.core.channels);
        const injected = vi
          .spyOn(f.core.channels, 'appendMessageOnce')
          .mockImplementationOnce((id, message, preview, origin, commit) =>
            append(id, message, preview, origin, (db) => {
              commit?.(db);
              throw new Error('injected-after-grant-before-decision');
            }),
          );
        await expect(f.methods.grantRequestApprove(f.payload)).rejects.toThrow(/transaction/);
        expect(f.core.grants.list('ada')).toHaveLength(legacy ? 1 : 0);
        if (legacy)
          expect(f.core.grants.list('ada')[0]).toMatchObject({
            orchestratorWrite: false,
            writeRevision: 0,
          });
        expect(f.core.channels.message(f.payload.channelId, 'request')?.grantRequestResolved).toBe(
          false,
        );
        injected.mockRestore();
        expect(await f.methods.grantRequestApprove(f.payload)).toMatchObject({
          ok: true,
          value: { grant: { orchestratorWrite: true, writeRevision: 1 } },
        });
      } finally {
        await f.close();
      }
    },
  );

  it('refuses unconfirmed, cross-Bot and stale requests without creating permissions', async () => {
    const f = fixture();
    try {
      await f.request();
      expect(
        await f.methods.grantRequestApprove({ ...f.payload, acknowledgeReadWrite: false }),
      ).toMatchObject({ ok: false });
      f.core.registry.create({ slug: 'bea', displayName: 'Bea' });
      expect(await f.methods.grantRequestApprove({ ...f.payload, slug: 'bea' })).toMatchObject({
        ok: false,
      });
      f.core.registry.setPaused('ada', true);
      expect(await f.methods.grantRequestApprove(f.payload)).toMatchObject({ ok: false });
      expect(f.core.grants.list('ada')).toEqual([]);
      expect(f.core.grants.list('bea')).toEqual([]);
    } finally {
      await f.close();
    }
  });
});
