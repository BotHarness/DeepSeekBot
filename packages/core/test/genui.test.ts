import { describe, expect, it } from 'vitest';
import { parseGenuiReport, validateGenuiView, initialGenuiView } from '../src/channels/genui.js';
import { comparisonReport } from './fixtures/genui-report.js';

describe('bounded GenUI message content', () => {
  it('accepts composed metrics, table and chart over stable snapshot items', () => {
    const report = parseGenuiReport(comparisonReport);
    expect(report.rows.map((row) => row.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(validateGenuiView(report, initialGenuiView())).toEqual(initialGenuiView());
  });
  it.each([
    { ...comparisonReport, version: 2 },
    { ...comparisonReport, script: 'execute' },
    { ...comparisonReport, rows: [comparisonReport.rows[0], comparisonReport.rows[0]] },
    {
      ...comparisonReport,
      rows: Array.from({ length: 101 }, (_, index) => ({
        id: `row-${index}`,
        values: { name: 'A', score: 1 },
      })),
    },
    { ...comparisonReport, elements: [{ kind: 'table', columnIds: ['missing'] }] },
    {
      ...comparisonReport,
      elements: [{ kind: 'bar-chart', labelColumnId: 'name', valueColumnId: 'name' }],
    },
  ])('rejects unknown, oversized or referentially invalid content', (value) => {
    expect(() => parseGenuiReport(value)).toThrow();
  });
  it('rejects fabricated selection and sort references without altering a valid draft', () => {
    const report = parseGenuiReport(comparisonReport);
    const draft = { ...initialGenuiView(), selectedIds: ['alpha'] };
    expect(validateGenuiView(report, draft)).toEqual(draft);
    expect(() => validateGenuiView(report, { ...draft, selectedIds: ['unknown'] })).toThrow();
    expect(() => validateGenuiView(report, { ...draft, sortColumnId: 'unknown' })).toThrow();
    expect(draft.selectedIds).toEqual(['alpha']);
  });
  it('enforces the encoded byte budget even when row and field counts are valid', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index}`,
      values: { name: '中'.repeat(500), score: index },
    }));
    expect(() => parseGenuiReport({ ...comparisonReport, rows })).toThrow('64 KiB');
  });
});
