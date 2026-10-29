// @vitest-environment jsdom
import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCore } from '../../core/src/plugin.js';
import { createBridgeMethods } from '../../core/src/bridge/methods.js';
import { createTempRoot } from '../../core/test/helpers.js';
import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

describe('Workspace request authorization round trip', () => {
  it.each([false, true])(
    'persists writable authority before resolving a request (legacy=%s)',
    async (legacy) => {
      const workspace = {
        id: 'project',
        path: realpathSync(createTempRoot('botharness-2080-project-')),
        title: 'Project',
        status: async () => 'ok' as const,
      };
      const core = createCore({
        dshHome: createTempRoot('botharness-2080-home-'),
        workspaces: () => ({ get: () => workspace, list: () => [workspace] }),
        agents: {
          async runOrchestrator() {},
          async runAssignment() {},
          async close() {},
          requestAssignment() {
            throw new Error('No Assignment expected');
          },
        },
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        const channel = core.channels.getOrCreateDm('ada', 'Ada')!;
        if (legacy) await core.grants.create('ada', workspace.id);
        await core.channels.appendMessage(channel.id, {
          id: 'request',
          at: new Date().toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: 'Please authorize the project so I can write the result.',
          grantRequest: true,
        });
        const methods = createBridgeMethods({ ...core });
        const call: BridgeCall = async (endpoint, payload) => {
          const method = methods[endpoint as keyof typeof methods];
          if (!method) throw new Error('Unexpected endpoint ' + endpoint);
          const result = await method(payload);
          return result.ok
            ? result
            : { ok: false, error: { ...result.error, details: result.error.details ?? {} } };
        };
        const actions = createActions(call, createStore(), {
          pickDirectory: async () => null,
          createWorkspace: async () => ({ workspaceId: workspace.id }),
        });
        await actions.resolveWorkspaceGrantRequest(
          'ada',
          'request',
          workspace.path,
          (name) => 'Authorized ' + name,
        );
        expect(core.grants.list('ada')).toMatchObject([
          { workspacePath: workspace.path, orchestratorWrite: true, writeRevision: 1 },
        ]);
        expect(core.channels.message(channel.id, 'request')?.grantRequestResolved).toBe(true);
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});
