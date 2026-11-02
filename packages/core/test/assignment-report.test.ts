import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseReportContent, prepareAssignmentReport } from '../src/runtime/assignment-report.js';
import { readAssignmentReportPage } from '../src/runtime/assignment-tail.js';

function queryFor(...summaries: string[]) {
  return {
    listEvents: async () => [],
    filterEvents: async () => summaries.map((_, seq) => ({ seq })),
    readEvent: async ({ seq }: { seq: number }) => ({
      target: {
        type: 'tool/call',
        data: {
          name: 'report_to_orchestrator',
          arguments: JSON.stringify({ summary: summaries[seq] }),
        },
      },
    }),
  };
}

const saveSpill = async ({ content }: { content: string }) => ({
  bytes: Buffer.byteLength(content),
  locator: 'opaque:report',
  retrievalHint: 'Provider guidance',
});

describe('Assignment Report content contract', () => {
  it('round-trips accepted Unicode text independently of display wording and later calls', async () => {
    const body = '报告😀'.repeat(1_500);
    const prepared = await prepareAssignmentReport('owned', `\n${body}\n`, saveSpill);
    const query = queryFor(`\n${body}\n`, `${body} changed`);
    let result = '';
    let offset = 0;
    do {
      const page = await readAssignmentReportPage(
        query,
        'owned',
        '任意展示文字',
        offset,
        prepared.content,
      );
      expect(page.returnedCharacters).toBeLessThanOrEqual(2_000);
      expect(page.readCount).toBe(2);
      result += page.text;
      if (page.nextOffset === undefined) break;
      offset = page.nextOffset;
    } while (true);
    expect(result).toBe(body);
  });

  it('treats footer-shaped inline text as content', async () => {
    const body = `Example…\n[Full report: 9 bytes; sha256: ${'0'.repeat(64)}; locator: example]`;
    const prepared = await prepareAssignmentReport('owned', body);
    const page = await readAssignmentReportPage(
      queryFor(body),
      'owned',
      prepared.summary,
      0,
      prepared.content,
    );
    expect(page.text).toBe(body);
    const legacy = await readAssignmentReportPage(queryFor(body), 'owned', body, 0);
    expect(legacy.text).toBe(body);
  });

  it('preserves the legacy spilled report read path', async () => {
    const body = 'legacy '.repeat(1_000).trim();
    const prepared = await prepareAssignmentReport('owned', body, saveSpill);
    const page = await readAssignmentReportPage(queryFor(body), 'owned', prepared.summary, 0);
    expect(page.text).toBe(body.slice(0, 2_000));
  });

  it('refuses unaccepted content and reads at most 64 candidate events', async () => {
    const prepared = await prepareAssignmentReport('owned', 'accepted');
    await expect(
      readAssignmentReportPage(
        queryFor(...Array.from({ length: 65 }, (_, i) => (i === 0 ? 'accepted' : 'other'))),
        'owned',
        prepared.summary,
        0,
        prepared.content,
      ),
    ).rejects.toThrow('was not found');
  });

  it('enforces spill size and provider byte agreement before acceptance', async () => {
    expect(() => prepareAssignmentReport('owned', 'x'.repeat(1_048_577), saveSpill)).toThrow(
      'exceeds',
    );
    expect(() => prepareAssignmentReport('owned', 'x'.repeat(2_049))).toThrow('unavailable');
    await expect(
      prepareAssignmentReport('owned', 'x'.repeat(2_049), async () => ({
        bytes: 1,
        locator: 'opaque',
        retrievalHint: 'read',
      })),
    ).rejects.toThrow('byte count mismatch');
  });
  it('matches old raw spill bytes first and canonical accepted whitespace second', async () => {
    const raw = `  ${'报告😀'.repeat(800)}  `;
    const prepared = await prepareAssignmentReport('owned', raw, saveSpill);
    const canonical = await readAssignmentReportPage(queryFor(raw), 'owned', prepared.summary, 0);
    expect(canonical.text).toBe(Array.from(raw.trim()).slice(0, 2000).join(''));
    const rawFooter = `${Array.from(raw).slice(0, 400).join('')}…\n[Full report: ${Buffer.byteLength(raw)} bytes; sha256: ${createHash('sha256').update(raw).digest('hex')}; locator: opaque]`;
    const legacy = await readAssignmentReportPage(queryFor(raw), 'owned', rawFooter, 0);
    expect(legacy.text).toBe(Array.from(raw).slice(0, 2000).join(''));
    expect(
      (await readAssignmentReportPage(queryFor('  old body  '), 'owned', 'old body', 0)).text,
    ).toBe('old body');
  });

  it.each([null, '{}', '{"author":{"kind":"bot"}}', '{"assignmentReport":{"state":"completed"}}'])(
    'keeps missing historic content metadata %s on the legacy path',
    (payload) => {
      expect(parseReportContent(payload)).toBeUndefined();
    },
  );

  it.each([
    'bad JSON',
    'null',
    '[]',
    '{"assignmentReport":null}',
    '{"assignmentReport":1}',
    '{"assignmentReport":{"content":null}}',
    '{"assignmentReport":{"content":{"version":2}}}',
  ])('refuses explicitly malformed report metadata %s', (payload) => {
    expect(() => parseReportContent(payload)).toThrow();
  });
});
