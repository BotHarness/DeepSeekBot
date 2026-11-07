import type { GenuiReport } from '../../src/channels/genui.js';

export const comparisonReport = {
  version: 1,
  snapshotId: 'synthetic-comparison-1',
  observedAt: '2026-11-07T12:00:00.000Z',
  title: 'Synthetic comparison',
  columns: [
    { id: 'name', label: 'Option', kind: 'text' },
    { id: 'score', label: 'Score', kind: 'number' },
  ],
  rows: [
    { id: 'alpha', values: { name: 'Alpha', score: 8 }, details: 'Synthetic option Alpha.' },
    { id: 'beta', values: { name: 'Beta', score: 5 }, details: 'Synthetic option Beta.' },
    { id: 'gamma', values: { name: 'Gamma', score: 9 }, details: 'Synthetic option Gamma.' },
  ],
  elements: [
    { kind: 'metric', label: 'Options', value: 3 },
    { kind: 'table', columnIds: ['name', 'score'] },
    { kind: 'bar-chart', labelColumnId: 'name', valueColumnId: 'score' },
  ],
} satisfies GenuiReport;
