// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  authorizeGroupMembers,
  type GroupGrantResult,
} from '../src/client/group-workspace-authorization.js';
import type { WorkspaceGrantView } from '../src/client/bridge.js';

const grant: WorkspaceGrantView = {
  id: 'grant',
  botSlug: 'ada',
  workspaceId: 'project',
  workspacePath: '/project',
  workspaceTitle: 'Project',
  createdAt: '',
  path: '/project',
  title: 'Project',
};

it('only writes selected members and preserves successes across partial failures and retries', async () => {
  const results: GroupGrantResult[] = [];
  const actions = {
    readGroupWorkspaceGrant: vi.fn(async (_channel: string, slug: string) =>
      slug === 'existing' ? grant : undefined,
    ),
    authorizeGroupWorkspacePath: vi.fn(async (_channel: string, slug: string) => {
      if (slug === 'failed') throw new Error('lost response');
      return { grant, created: true };
    }),
  };
  const request = {
    actions,
    channelId: 'group',
    path: '/project',
    slugs: ['ada', 'failed', 'existing', 'ada'],
    onResult: (row: GroupGrantResult) => results.push(row),
  };
  await authorizeGroupMembers(request);
  expect(results.map((row) => [row.slug, row.status])).toEqual([
    ['ada', 'created'],
    ['failed', 'unknown'],
    ['existing', 'existing'],
  ]);
  expect(actions.authorizeGroupWorkspacePath.mock.calls.map((call) => call[1])).toEqual([
    'ada',
    'failed',
  ]);
  actions.readGroupWorkspaceGrant.mockImplementation(async (_channel, slug) =>
    slug === 'failed' ? grant : undefined,
  );
  await authorizeGroupMembers({ ...request, previous: [...results] });
  expect(results.at(-1)?.status).toBe('confirmed');
  expect(actions.authorizeGroupWorkspacePath).toHaveBeenCalledTimes(2);
});

it('never retries a write when authoritative readback is unavailable', async () => {
  const actions = {
    readGroupWorkspaceGrant: vi.fn(async () => {
      throw new Error('offline');
    }),
    authorizeGroupWorkspacePath: vi.fn(),
  };
  const onResult = vi.fn();
  await authorizeGroupMembers({
    actions,
    channelId: 'group',
    path: '/project',
    slugs: ['ada'],
    previous: [{ slug: 'ada', status: 'unknown' }],
    onResult,
  });
  expect(actions.authorizeGroupWorkspacePath).not.toHaveBeenCalled();
  expect(onResult).toHaveBeenCalledWith({ slug: 'ada', status: 'unknown', error: 'offline' });
});

it('reads back a committed mutation whose response was lost before reporting success', async () => {
  const actions = {
    readGroupWorkspaceGrant: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(grant),
    authorizeGroupWorkspacePath: vi.fn(async () => {
      throw new Error('timeout');
    }),
  };
  const onResult = vi.fn();
  await authorizeGroupMembers({
    actions,
    channelId: 'group',
    path: '/project',
    slugs: ['ada'],
    onResult,
  });
  expect(onResult).toHaveBeenCalledWith({ slug: 'ada', status: 'confirmed', grant });
});
