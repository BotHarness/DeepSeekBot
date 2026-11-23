import { describe, expect, it, vi } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { channelAttachmentUrl, type BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';
import { bridgeCall } from './bridge-helpers.js';

describe('Workspace folder authorization action', () => {
  it('uses the Host picker, DSH Workspace registration, and BotHarness Grant in that order', async () => {
    const steps: string[] = [];
    const grant = {
      id: 'grant-1',
      botSlug: 'ada',
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/project',
      workspaceTitle: 'project',
      createdAt: '2026-09-24T00:00:00.000Z',
    };
    const call = bridgeCall({
      grantCreate(payload) {
        steps.push('grant');
        expect(payload).toEqual({ slug: 'ada', workspaceId: 'workspace-1' });
        return { grant };
      },
    });
    const actions = createActions(call, createStore(), {
      async pickDirectory() {
        steps.push('pick');
        return '/tmp/project';
      },
      async createWorkspace(input) {
        steps.push('register');
        expect(input).toEqual({ path: '/tmp/project' });
        return { workspaceId: 'workspace-1' };
      },
    });

    await expect(actions.addWorkspaceFolder('ada')).resolves.toMatchObject(grant);
    expect(steps).toEqual(['pick', 'register', 'grant']);
  });

  it('does not register or grant a cancelled folder choice', async () => {
    const createWorkspace = vi.fn(async () => ({ workspaceId: 'workspace-1' }));
    const call: BridgeCall = vi.fn(async () => {
      throw new Error('unexpected Grant call');
    });
    const actions = createActions(call, createStore(), {
      pickDirectory: async () => null,
      createWorkspace,
    });

    await expect(actions.addWorkspaceFolder('ada')).resolves.toBeUndefined();
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('Workspace native action bridge', () => {
  it('propagates Host folder refusal codes without falling back to a different picker', async () => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: false,
      error: { code: 'folder-browse/denied', message: 'Access denied', details: {} },
    }));
    await expect(createActions(call, createStore()).listHostFolders('D:\\')).rejects.toMatchObject({
      code: 'folder-browse/denied',
    });
    expect(call).toHaveBeenCalledOnce();
  });

  it('rejects malformed drive entries from the Host', async () => {
    const call = vi.fn<BridgeCall>(async () => ({
      ok: true,
      value: {
        path: 'C:\\',
        home: 'C:\\Users\\ada',
        crumbs: [],
        entries: [],
        truncated: false,
        roots: [{ name: 'D:\\' }],
      },
    }));
    await expect(createActions(call, createStore()).listHostFolders()).rejects.toThrow(
      'folderBrowse returned an unreadable folder.',
    );
  });
  it('resolves the owner before discovery/open and makes no Grant or Session mutations', async () => {
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      expect(method).toBe('workspaceFileTarget');
      expect(payload).toEqual({ slug: 'ada', grantId: 'grant-1' });
      return {
        ok: true,
        value: { target: { path: '/host/project', relativePath: '', kind: 'directory' } },
      };
    });
    const nativeFiles = {
      applications: vi.fn(async () => ({ available: true, applications: [] })),
      open: vi.fn(async () => {}),
    };
    const store = createStore();
    const before = store.getSnapshot();
    const actions = createActions(call, store, {
      nativeFiles,
      pickDirectory: async () => null,
      createWorkspace: async () => {
        throw new Error('not used');
      },
    });
    await actions.workspaceFileApplications('ada', 'grant-1');
    await actions.workspaceFileOpen('ada', 'grant-1', { application: 'finder' });
    expect(nativeFiles.open).toHaveBeenCalledWith(
      { path: '/host/project', relativePath: '', kind: 'directory' },
      { application: 'finder' },
    );
    expect(store.getSnapshot()).toEqual(before);
    call.mockResolvedValueOnce({
      ok: false,
      error: { code: 'invalid-grant', message: 'revoked', details: {} },
    });
    await expect(
      actions.workspaceFileOpen('ada', 'grant-1', { application: 'finder' }),
    ).rejects.toThrow('revoked');
    expect(nativeFiles.open).toHaveBeenCalledTimes(1);
    call.mockResolvedValueOnce({
      ok: true,
      value: { target: { path: '/host/file', relativePath: '', kind: 'file' } },
    });
    await expect(actions.workspaceFileTarget('ada', 'grant-1')).rejects.toThrow(
      'Invalid Workspace directory target',
    );
  });
});

describe('message attachment native action bridge', () => {
  it('requires the same owning message for legacy and canonical download URLs', () => {
    const owner = { channelId: 'group-owner', messageId: 'message-owner' };
    const legacy = {
      hash: `sha256:${'a'.repeat(64)}`,
      name: 'notes.txt',
      mime: 'text/plain',
      size: 4,
    };
    const canonical = {
      fileId: 'file:00000000-0000-4000-8000-000000000001',
      name: 'notes.txt',
      mime: 'text/plain',
      size: 4,
    };
    for (const ref of [legacy, canonical]) {
      const url = new URL(channelAttachmentUrl(ref, owner), 'http://local');
      expect(url.searchParams.get('channelId')).toBe(owner.channelId);
      expect(url.searchParams.get('messageId')).toBe(owner.messageId);
      expect(() => Reflect.apply(channelAttachmentUrl, undefined, [ref])).toThrow('ownership');
    }
  });

  it('resolves current ownership again before launch and refuses a removed message without mutating UI authority', async () => {
    const call = vi.fn<BridgeCall>(async (method, payload) => {
      expect(method).toBe('messageAttachmentTarget');
      expect(payload).toEqual({
        channelId: 'group-owner',
        messageId: 'message-owner',
        fileId: 'file-id',
      });
      return {
        ok: true,
        value: {
          target: { path: '/host/files/notes.txt', relativePath: 'notes.txt', kind: 'file' },
        },
      };
    });
    const nativeFiles = {
      applications: vi.fn(async () => ({ available: true, applications: [] })),
      open: vi.fn(async () => undefined),
    };
    const store = createStore();
    const before = store.getSnapshot();
    const actions = createActions(call, store, {
      nativeFiles,
      pickDirectory: async () => null,
      createWorkspace: async () => {
        throw new Error('not used');
      },
    });
    await actions.messageAttachmentApplications('group-owner', 'message-owner', 'file-id');
    await actions.messageAttachmentOpen('group-owner', 'message-owner', 'file-id', {
      application: 'editor',
    });
    expect(call).toHaveBeenCalledTimes(2);
    expect(nativeFiles.open).toHaveBeenCalledWith(
      { path: '/host/files/notes.txt', relativePath: 'notes.txt', kind: 'file' },
      { application: 'editor' },
    );
    call.mockResolvedValueOnce({
      ok: false,
      error: { code: 'not-found', message: 'message is unavailable', details: {} },
    });
    await expect(
      actions.messageAttachmentOpen('group-owner', 'message-owner', 'file-id', {
        action: 'reveal',
      }),
    ).rejects.toThrow('message is unavailable');
    expect(nativeFiles.open).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual(before);
  });
});
