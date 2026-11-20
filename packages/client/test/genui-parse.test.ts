import { describe, expect, it, vi } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { genuiReplySchema } from '../../core/src/channels/genui.js';
import { genuiDocumentReplySchema } from '../../core/src/channels/genui-document.js';
import { comparisonReport as syntheticGenuiReport } from '../../core/test/fixtures/genui-report.js';

const message = {
  id: 'report-message',
  at: '2026-11-07T12:00:00Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Readable report summary',
};

const document = {
  version: 2,
  snapshotId: 'document-1',
  title: 'Synthetic document',
  observedAt: '2026-11-08T00:00:00Z',
  html: '<p>Synthetic</p>',
};

describe('GenUI document message parsing', () => {
  it('retains a validated document only on Bot content', () => {
    expect(parseChannelMessage({ ...message, genui: document })?.genui).toEqual(document);
    expect(
      parseChannelMessage({ ...message, author: { kind: 'human' }, genui: document })?.genui,
    ).toBeUndefined();
  });
  it.each([
    { ...document, version: 3 },
    { ...document, html: '' },
    { ...document, html: 'x'.repeat(196_609) },
  ])('keeps the readable summary for invalid/unsupported documents', (genui) => {
    const parsed = parseChannelMessage({ ...message, genui });
    expect(parsed?.body).toBe(message.body);
    expect(parsed?.genui).toBeUndefined();
    expect(parsed?.genuiUnavailable).toBe(true);
  });
  it('parses bounded v2 Human metadata without trusting page-authored callbacks', () => {
    const reply = {
      version: 2,
      messageId: 'document-message',
      snapshotId: document.snapshotId,
      intent: 'continue',
      state: { version: 1, values: { query: 'local' } },
    };
    expect(
      parseChannelMessage({ ...message, author: { kind: 'human' }, genuiReply: reply })?.genuiReply,
    ).toEqual(reply);
    expect(parseChannelMessage({ ...message, genuiReply: reply })?.genuiReply).toBeUndefined();
    expect(
      parseChannelMessage({
        ...message,
        author: { kind: 'human' },
        genuiReply: { ...reply, intent: 'run-tool' },
      })?.genuiReply,
    ).toBeUndefined();
  });
});

describe('GenUI channel message parsing', () => {
  it('does not validate absent reply metadata in ordinary history', () => {
    const reportParse = vi.spyOn(genuiReplySchema, 'safeParse');
    const documentParse = vi.spyOn(genuiDocumentReplySchema, 'safeParse');
    try {
      for (let index = 0; index < 600; index += 1) {
        const parsed = parseChannelMessage({
          ...message,
          id: `ordinary-${index}`,
          author: { kind: 'human' },
        });
        expect(parsed?.body).toBe(message.body);
        expect(parsed?.genuiReply).toBeUndefined();
      }
      expect(reportParse).not.toHaveBeenCalled();
      expect(documentParse).not.toHaveBeenCalled();
    } finally {
      reportParse.mockRestore();
      documentParse.mockRestore();
    }
  });

  it.each([null, false, 0, '', {}, { version: 2 }])(
    'still validates present malformed reply metadata: %j',
    (genuiReply) => {
      const reportParse = vi.spyOn(genuiReplySchema, 'safeParse');
      const documentParse = vi.spyOn(genuiDocumentReplySchema, 'safeParse');
      try {
        const parsed = parseChannelMessage({
          ...message,
          author: { kind: 'human' },
          genuiReply,
        });
        expect(parsed?.body).toBe(message.body);
        expect(parsed?.genuiReply).toBeUndefined();
        expect(reportParse.mock.calls.length + documentParse.mock.calls.length).toBe(1);
      } finally {
        reportParse.mockRestore();
        documentParse.mockRestore();
      }
    },
  );

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
