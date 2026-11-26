import { describe, expect, it, vi } from 'vitest';
import { ownedSessions } from '../src/session-model';

describe('ownedSessions', () => {
  it('keeps the Host row fields the Sessions panel reads, such as the Subagent count', async () => {
    const host = {
      call: vi.fn(async () => ({
        sessions: [
          {
            role: 'orchestrator',
            sessionId: 'orchestrator-ada',
            createdAt: '2026-11-25T21:00:00.000Z',
            displayTitle: '   ',
            currentOrchestrator: true,
            subagentCount: 2,
            engine: 'claude',
            cwdReference: '/work/ada',
          },
          { role: 'subagent', sessionId: 'child', createdAt: '2026-11-25T21:00:00.000Z' },
        ],
      })),
    };
    expect(await ownedSessions(host, 'ada')).toEqual([
      {
        role: 'orchestrator',
        sessionId: 'orchestrator-ada',
        createdAt: '2026-11-25T21:00:00.000Z',
        currentOrchestrator: true,
        subagentCount: 2,
        engine: 'claude',
        cwdReference: '/work/ada',
      },
    ]);
  });
});
