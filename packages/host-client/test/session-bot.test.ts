import { describe, expect, it, vi } from 'vitest';
import {
  grantedWorkspacePath,
  latestSessionIds,
  readImportableSessions,
  sessionWorkspaces,
} from '../src/session-bot';

const row = (sessionId: string, cwd: string, lastPromptAt?: number, kind = 'native') => ({
  sessionId,
  cwd,
  folderName: cwd.split('/').at(-1),
  running: false,
  updatedAt: 1,
  ...(lastPromptAt === undefined ? {} : { lastPromptAt }),
  source: kind === 'native' ? { kind } : { kind, botSlug: 'bot-a', displayName: 'A' },
});

describe('readImportableSessions', () => {
  it('keeps prompted native Sessions, newest first, and groups them by Workspace', async () => {
    const host = {
      call: vi.fn(async (method: string) =>
        method === 'workspaceOptions'
          ? {
              workspaces: [
                { id: 'app', title: 'app', path: '/work/app' },
                { id: 'site', title: 'site', path: '/work/site' },
              ],
            }
          : {
              queryVersion: 1,
              sources: [{ kind: 'native' }],
              sessions: [
                row('old', '/work/app/api', 10),
                row('blank', '/work/app'),
                { ...row('nowhere', '/x', 50), cwd: undefined },
                row('bot', '/work/app', 40, 'bot'),
                row('new', '/work/app', 30),
                row('other', '/work/site', 20),
                row('loose', '/elsewhere', 25),
              ],
            },
      ),
    };
    const rows = await readImportableSessions(host);
    expect(rows.map((item) => item.sessionId)).toEqual(['new', 'other', 'old']);
    expect(rows.map((item) => item.workspacePath)).toEqual([
      '/work/app',
      '/work/site',
      '/work/app',
    ]);
    expect(sessionWorkspaces(rows)).toMatchObject([
      { path: '/work/app', name: 'app', sessionIds: ['new', 'old'] },
      { path: '/work/site', name: 'site', sessionIds: ['other'] },
    ]);
    expect(latestSessionIds(rows, 1, '/work/app')).toEqual(['new']);
    expect(latestSessionIds(rows, 5, '/work/app')).toEqual(['new', 'old']);
  });
});

describe('grantedWorkspacePath', () => {
  it('picks the deepest Workspace that contains the folder', () => {
    const roots = ['/work', '/work/app', '/work/application'];
    expect(grantedWorkspacePath(roots, '/work/app/api')).toBe('/work/app');
    expect(grantedWorkspacePath(roots, '/work/application')).toBe('/work/application');
    expect(grantedWorkspacePath(roots, '/work/apps')).toBe('/work');
    expect(grantedWorkspacePath(roots, '/other')).toBeUndefined();
  });

  it('adds Claude Code and Codex sessions, marks folders that are not Workspaces and surfaces read failures', async () => {
    const answers = (external: () => unknown) => ({
      call: vi.fn(async (method: string) => {
        if (method === 'workspaceOptions')
          return { workspaces: [{ id: 'app', title: 'app', path: '/work/app' }] };
        if (method === 'externalSessions') return external();
        return { queryVersion: 1, sources: [{ kind: 'native' }], sessions: [] };
      }),
    });
    const rows = await readImportableSessions(
      answers(() => ({
        sessions: [
          {
            sessionId: 'claude-code:a',
            source: 'claude-code',
            cwd: '/work/app/web',
            lastActivityAt: 2,
          },
          { sessionId: 'codex:b', source: 'codex', cwd: '/elsewhere', lastActivityAt: 3 },
          'junk',
        ],
      })),
    );
    expect(
      rows.map((row) => [row.sessionId, row.product, row.workspacePath, row.addsWorkspace]),
    ).toEqual([
      ['codex:b', 'codex', '/elsewhere', true],
      ['claude-code:a', 'claude-code', '/work/app', undefined],
    ]);
    await expect(
      readImportableSessions(
        answers(() => {
          throw new Error('The Host could not read sessions from other products.');
        }),
      ),
    ).rejects.toThrow('could not read');
  });
});
