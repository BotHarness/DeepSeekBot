// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

describe('Inbox workspace Grant', () => {
  it.each(['pending', 'stale', 'unconfirmed'] as const)(
    'keeps source authority for %s requests independently of the selected DM',
    async (state) => {
      let resolved = state === 'stale';
      const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
      const folders: string[] = [];
      const call: BridgeCall = async (endpoint, payload) => {
        calls.push({ endpoint, payload });
        if (endpoint === 'channelTimeline')
          return {
            ok: true,
            value: {
              revision: 1,
              page: {
                entries: [
                  {
                    id: 'request',
                    at: '2026-10-01T10:00:00Z',
                    author: { kind: 'bot', slug: 'ada' },
                    body: 'Choose a folder',
                    grantRequest: true,
                    grantRequestResolved: resolved,
                  },
                ],
                olderCursor: null,
                newerCursor: null,
                hasOlder: false,
                hasNewer: false,
              },
            },
          };
        if (endpoint === 'grantCreate')
          return {
            ok: true,
            value: {
              grant: {
                id: 'grant',
                botSlug: 'ada',
                workspaceId: 'project',
                workspacePath: '/chosen/project',
                workspaceTitle: 'Project',
                createdAt: '2026-10-01T10:01:00Z',
              },
            },
          };
        if (endpoint === 'grantRequestApprove') {
          if (state === 'unconfirmed')
            return {
              ok: false,
              error: { code: 'invalid-input', message: 'Grant revoked', details: {} },
            };
          resolved = true;
          return {
            ok: true,
            value: {
              grant: {
                id: 'grant',
                botSlug: 'ada',
                workspaceId: 'project',
                workspacePath: '/chosen/project',
                workspaceTitle: 'Project',
                createdAt: '2026-10-01T10:01:00Z',
                orchestratorWrite: true,
                writeRevision: 1,
              },
              message: {
                id: 'grant-resolution-request',
                at: '2026-10-01T10:02:00Z',
                author: { kind: 'human' },
                body: 'Authorized Project',
                replyTo: payload['requestMessageId'],
                grantRequestResolution: { requestMessageId: 'request', grantId: 'grant' },
              },
            },
          };
        }
        if (endpoint === 'humanAttentionStatus')
          return { ok: true, value: { unreadCount: 2, hasAction: true } };
        if (endpoint === 'humanAttention')
          return {
            ok: true,
            value: {
              items: resolved
                ? []
                : [
                    {
                      id: 'grant:request',
                      category: 'action',
                      kind: 'workspace-grant-request',
                      botSlug: 'ada',
                      channelId: 'dm-ada',
                      channelName: 'Ada',
                      messageId: 'request',
                      createdAt: '2026-10-01T10:00:00Z',
                      summary: 'Choose a folder',
                    },
                  ],
            },
          };
        throw new Error('Unexpected endpoint ' + endpoint);
      };
      const store = createStore();
      store.select({ kind: 'inbox' });
      const actions = createActions(call, store, {
        pickDirectory: async () => null,
        createWorkspace: async ({ path }) => {
          folders.push(path);
          return { workspaceId: 'project' };
        },
      });
      const submit = actions.resolveWorkspaceGrantRequest(
        'ada',
        'request',
        '/chosen/project',
        (name) => 'Authorized ' + name,
      );
      if (state === 'pending') await submit;
      else await expect(submit).rejects.toThrow();
      expect(store.getSnapshot().selection).toEqual({ kind: 'inbox' });
      expect(folders).toEqual(state === 'stale' ? [] : ['/chosen/project']);
      const sent = calls.find((row) => row.endpoint === 'grantRequestApprove');
      if (state !== 'stale')
        expect(sent?.payload).toMatchObject({
          channelId: 'dm-ada',
          requestMessageId: 'request',
          workspaceId: 'project',
          acknowledgeReadWrite: true,
        });
      expect(store.getSnapshot().humanInbox.items).toHaveLength(state === 'unconfirmed' ? 1 : 0);
    },
  );
});
