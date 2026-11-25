import { describe, expect, it, vi } from 'vitest';
import { latestSessionIds, readImportableSessions, sessionWorkspaces } from '../src/session-bot';

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
      call: vi.fn().mockResolvedValue({
        queryVersion: 1,
        sources: [{ kind: 'native' }],
        sessions: [
          row('old', '/work/app', 10),
          row('blank', '/work/app'),
          { ...row('nowhere', '/x', 50), cwd: undefined },
          row('bot', '/work/app', 40, 'bot'),
          row('new', '/work/app', 30),
          row('other', '/work/site', 20),
        ],
      }),
    };
    const rows = await readImportableSessions(host);
    expect(rows.map((item) => item.sessionId)).toEqual(['new', 'other', 'old']);
    expect(sessionWorkspaces(rows)).toMatchObject([
      { cwd: '/work/app', name: 'app', sessionIds: ['new', 'old'] },
      { cwd: '/work/site', name: 'site', sessionIds: ['other'] },
    ]);
    expect(latestSessionIds(rows, 1, '/work/app')).toEqual(['new']);
  });
});
