import { describe, expect, it } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { comparisonReport as syntheticGenuiReport } from '../../core/test/fixtures/genui-report.js';

const message = {
  id: 'report-message',
  at: '2026-11-07T12:00:00Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Readable report summary',
};

describe('GenUI channel message parsing', () => {
  it('retains a validated version-one report', () => {
    expect(parseChannelMessage({ ...message, genui: syntheticGenuiReport })?.genui).toEqual(
      syntheticGenuiReport,
    );
  });

  it.each([
    { ...syntheticGenuiReport, version: 2 },
    { ...syntheticGenuiReport, rows: [{ id: 'bad', values: {} }] },
    { ...syntheticGenuiReport, elements: [{ kind: 'script', source: 'alert(1)' }] },
  ])('preserves the ordinary summary for unsupported or invalid reports', (genui) => {
    const parsed = parseChannelMessage({ ...message, genui });
    expect(parsed?.body).toBe(message.body);
    expect(parsed?.genui).toBeUndefined();
  });

  it('does not trust a report attached to a Human message', () => {
    expect(
      parseChannelMessage({ ...message, author: { kind: 'human' }, genui: syntheticGenuiReport })
        ?.genui,
    ).toBeUndefined();
  });

  it('retains valid ordinary Human reply metadata without dropping malformed summaries', () => {
    const genuiReply = {
      messageId: message.id,
      snapshotId: syntheticGenuiReport.snapshotId,
      selectedIds: ['alpha'],
      intent: 'continue',
    };
    expect(
      parseChannelMessage({ ...message, author: { kind: 'human' }, genuiReply })?.genuiReply,
    ).toEqual(genuiReply);
    expect(parseChannelMessage({ ...message, genuiReply: { intent: 'execute' } })?.body).toBe(
      message.body,
    );
  });
});
