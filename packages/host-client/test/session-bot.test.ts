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
                row('old', '/work/app', 10),
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
      { cwd: '/work/app', name: 'app', sessionIds: ['new', 'old'] },
      { cwd: '/work/site', name: 'site', sessionIds: ['other'] },
    ]);
    expect(latestSessionIds(rows, 1, '/work/app')).toEqual(['new']);
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
});
