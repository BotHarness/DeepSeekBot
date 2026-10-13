import { describe, expect, it } from 'vitest';

import { groupSessionRowsByWorkspace, personaBotSessionRows } from '../src/client/session-rows.js';

const createdAt = '2026-09-26T00:00:00.000Z';
const owned = [
  {
    sessionId: 'orchestrator',
    role: 'orchestrator' as const,
    createdAt,
    cwdReference: '/memory/ada',
  },
  {
    sessionId: 'active',
    role: 'assignment' as const,
    createdAt,
    cwdReference: '/projects/a',
    assignmentActivity: 'working' as const,
  },
  {
    sessionId: 'stopped',
    role: 'assignment' as const,
    createdAt,
    cwdReference: '/projects/b',
    assignmentActivity: 'stopped' as const,
    assignmentAccessMode: 'danger-full-access' as const,
  },
  {
    sessionId: 'missing',
    role: 'assignment' as const,
    createdAt,
    cwdReference: '/projects/c',
    assignmentActivity: 'working' as const,
  },
];
const native = {
  orchestrator: {
    displayTitle: 'Plan the release',
    cwd: '/memory/ada',
    updatedAt: 100,
    running: false,
  },
  active: { displayTitle: 'Build the UI', cwd: '/projects/a', updatedAt: 200, running: true },
  stopped: { displayTitle: 'Old task', cwd: '/projects/b', updatedAt: 300, running: false },
};

describe('PersonaBot Session projection', () => {
  it('shows the Orchestrator and working Assignments first, from native titles and live state', () => {
    const rows = personaBotSessionRows(owned, native, 'current');
    expect(rows.map((row) => [row.sessionId, row.title, row.status])).toEqual([
      ['orchestrator', 'Plan the release', 'idle'],
      ['active', 'Build the UI', 'running'],
      ['missing', 'missing', 'unavailable'],
    ]);
    expect(rows[1]?.cwd).toBe('/projects/a');
  });

  it('pins the Orchestrator the runtime resumes, not a newer archived one', () => {
    const replaced = [
      { ...owned[0]!, sessionId: 'resumed', currentOrchestrator: true },
      {
        ...owned[0]!,
        sessionId: 'archived',
        createdAt: '2026-09-27T00:00:00.000Z',
        currentOrchestrator: false,
      },
    ];
    expect(personaBotSessionRows(replaced, {}, 'current').map((row) => row.sessionId)).toEqual([
      'resumed',
    ]);
    expect(
      personaBotSessionRows(
        replaced.map((item) => ({ ...item, currentOrchestrator: false })),
        {},
        'current',
      ),
    ).toEqual([]);
  });

  it('groups ordered Sessions by exact workspace path without changing row identity', () => {
    const rows = personaBotSessionRows(owned, native, 'all');
    const groups = groupSessionRowsByWorkspace(rows);
    expect(groups.map((group) => [group.name, group.rows.map((row) => row.sessionId)])).toEqual([
      ['ada', ['orchestrator']],
      ['a', ['active']],
      ['c', ['missing']],
      ['b', ['stopped']],
    ]);
    expect(groups.flatMap((group) => group.rows)).toEqual(rows);
    expect(
      groupSessionRowsByWorkspace([
        { ...rows[0]!, cwd: 'C:\\projects\\same' },
        { ...rows[1]!, cwd: 'C:/projects/same/' },
        { ...rows[2]!, cwd: '/other/same' },
      ]),
    ).toHaveLength(2);
  });

  it('includes stopped Session history only in All and never treats cwd as Bot ownership', () => {
    const rows = personaBotSessionRows(owned, native, 'all');
    expect(rows.map((row) => row.sessionId)).toEqual([
      'orchestrator',
      'active',
      'missing',
      'stopped',
    ]);
    expect(rows.find((row) => row.sessionId === 'stopped')).toMatchObject({
      status: 'stopped',
      assignmentAccessMode: 'danger-full-access',
    });
    expect(rows).toHaveLength(owned.length);
  });
});
