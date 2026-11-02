// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createNativeHostFiles } from '../src/client/host-file-actions.js';
import type { SessionRemote } from '@deepseek-ai/dsh-api-session-controller/client';

function session(available = true) {
  return {
    canOpenWorkspacePath: vi.fn(async () => ({ ok: true as const, value: available })),
    workspacePathApplications: vi.fn(async () => ({
      ok: true as const,
      value: [{ id: 'registered.editor', name: 'Editor', default: true, icon: null }],
    })),
    openWorkspacePath: vi.fn(async () => ({ ok: true as const, value: { opened: true as const } })),
  } satisfies Pick<
    SessionRemote,
    'canOpenWorkspacePath' | 'workspacePathApplications' | 'openWorkspacePath'
  >;
}
const file = {
  path: '/host/你好 world.txt',
  relativePath: '你好 world.txt',
  kind: 'file' as const,
};
describe('DSH native file adapter', () => {
  it('checks opening availability without resolving a file or starting an application', async () => {
    const remote = session(false);
    expect(await createNativeHostFiles(remote).available?.()).toBe(false);
    expect(remote.workspacePathApplications).not.toHaveBeenCalled();
    expect(remote.openWorkspacePath).not.toHaveBeenCalled();
  });
  it('uses discovered file handlers and passes only the native reveal action or application id', async () => {
    const remote = session();
    const native = createNativeHostFiles(remote);
    expect((await native.applications(file)).applications[0]?.default).toBe(true);
    await native.open(file, { application: 'registered.editor' });
    expect(remote.openWorkspacePath).toHaveBeenLastCalledWith(
      { path: file.path, application: 'registered.editor' },
      expect.any(AbortSignal),
    );
    await native.open(file, { action: 'reveal' });
    expect(remote.openWorkspacePath).toHaveBeenLastCalledWith(
      { path: file.path, action: 'reveal' },
      expect.any(AbortSignal),
    );
  });
  it('queries no applications when the Host reports capability unavailable', async () => {
    const remote = session(false);
    expect(await createNativeHostFiles(remote).applications(file)).toEqual({
      available: false,
      applications: [],
    });
    expect(remote.workspacePathApplications).not.toHaveBeenCalled();
  });
  it('keeps reveal after a handler query refusal', async () => {
    const remote = {
      ...session(),
      workspacePathApplications: vi.fn(async () => ({
        ok: false as const,
        error: Object.assign(new Error('native query failed'), {
          name: 'RemoteError',
          code: 'gateway/internal' as const,
          details: {},
          isDSHRemoteError: true as const,
        }),
      })),
    };
    expect(await createNativeHostFiles(remote).applications(file)).toEqual({
      available: true,
      applications: [],
      error: 'native query failed',
    });
  });
  it('lists only installed directory catalog ids and uses a document-relative directory launch', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ apps: ['finder', 'vscode'] }));
    const native = createNativeHostFiles(session(), fetcher);
    const directory = { ...file, kind: 'directory' as const };
    expect((await native.applications(directory)).applications.map((app) => app.id)).toEqual([
      'finder',
      'vscode',
    ]);
    await native.open(directory, { application: 'vscode' });
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining('/open-in-app/open'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ app: 'vscode', path: file.path }),
      }),
    );
    await expect(native.open(directory, { action: 'reveal' })).rejects.toThrow(
      'Directories require',
    );
  });
});
