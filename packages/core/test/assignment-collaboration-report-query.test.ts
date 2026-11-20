import type { AssignmentReportContent } from '../src/runtime/assignment-report.js';
import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { readAssignmentReportPage } from '../src/runtime/assignment-tail.js';
import { TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { sourceEvents, setup } from './assignment-collaboration-fixtures.js';

describe('Assignment collaboration', () => {
  it('keeps a 2 KiB report inline and spills the next byte', async () => {
    const saved: string[] = [];
    const { agents, admit, close } = await setup({
      saveReportSpill: async ({ content }) => {
        saved.push(content);
        return {
          locator: 'opaque-report',
          bytes: Buffer.byteLength(content),
          retrievalHint: 'Read the report.',
        };
      },
    });
    try {
      await admit('Start research', 'human-spill-boundary');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const run = agents.started[0]!.run;
      await run.report({ state: 'progress', summary: 'a'.repeat(2_048) });
      expect(saved).toEqual([]);
      await run.report({ state: 'progress', summary: 'b'.repeat(2_049) });
      expect(saved).toEqual(['b'.repeat(2_049)]);
    } finally {
      await close();
    }
  });

  it('spills an oversized report before admitting its bounded Inbox summary', async () => {
    const saved: Array<{ sessionId: string; content: string }> = [];
    const { runtime, agents, owner, admit, close } = await setup({
      readAssignmentReportPage: (sessionId, summary, offset, content) =>
        readAssignmentReportPage(
          {
            listEvents: async () => [],
            filterEvents: async () => [{ seq: 1 }],
            readEvent: async () => ({
              target: {
                type: 'tool/call',
                data: {
                  name: 'report_to_orchestrator',
                  arguments: JSON.stringify({ summary: saved[0]!.content }),
                },
              },
            }),
          },
          sessionId,
          summary,
          offset,
          content,
        ),
      saveReportSpill: async (input) => {
        saved.push(input);
        return {
          locator: '/private/spill/report.txt',
          bytes: Buffer.byteLength(input.content),
          retrievalHint: 'Use read on this locator.',
        };
      },
    });
    try {
      await admit('Start research', 'human-spill');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Long research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const content = `Report start ${'α'.repeat(1200)} FINAL-MARKER`;
      await agents.started[0]!.run.report({ state: 'completed', summary: content });
      agents.finish(created.assignment.sessionId);
      await runtime.whenIdle();
      expect(saved).toEqual([{ sessionId: created.assignment.sessionId, content }]);
      const summary = runtime.getAssignment('ada', created.assignment.sessionId)?.latestReport
        ?.summary;
      expect(summary).toContain('/private/spill/report.txt');
      expect(summary).toMatch(/sha256: [0-9a-f]{64}/u);
      expect(summary).not.toContain('FINAL-MARKER');
      const first = await agents.access!.reportPage!({
        sessionId: created.assignment.sessionId,
        offset: 0,
      });
      const page = await agents.access!.reportPage!({
        sessionId: created.assignment.sessionId,
        offset: 1_000,
        reportSourceEventId: first.reportSourceEventId,
      });
      expect(page.text).toContain('FINAL-MARKER');
      expect(page.sourceEventBytes).toBeGreaterThan(Buffer.byteLength(content));
      expect(agents.inboxTurns[0]).toContain('/private/spill/report.txt');
      expect(agents.inboxTurns[0]).not.toContain('FINAL-MARKER');
      const source = attachOperationalModule(owner, 'spill-test').read((database) =>
        database
          .prepare(
            "SELECT body, payload_json FROM source_events WHERE source_kind = 'assignment-report'",
          )
          .get(),
      ) as { body: string; payload_json: string };
      expect(source.body).toBe(summary);
      expect(JSON.parse(source.payload_json).assignmentReport.content).toMatchObject({
        version: 1,
        bytes: Buffer.byteLength(content),
        sha256: expect.any(String),
        spill: { locator: '/private/spill/report.txt', retrievalHint: 'Use read on this locator.' },
      });
      await agents.access!.stop(created.assignment.sessionId);
      await expect(
        agents.started[0]!.run.report({ state: 'completed', summary: content }),
      ).rejects.toThrow('unavailable or stopping');
      expect(saved).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it('authorizes Session Query tail reads through the owning Bot Assignment Directory', async () => {
    const readAssignmentTail = vi.fn(async () => ({
      events: [],
      indexedEvents: 0,
      readCount: 0,
      sourceEventBytes: 0,
      returnedCharacters: 0,
      estimatedTokens: 0,
    }));
    const { agents, admit, close } = await setup({ readAssignmentTail });
    try {
      await admit('Start', 'human-tail');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      await expect(agents.access!.tail?.(created.assignment.sessionId)).resolves.toMatchObject({
        indexedEvents: 0,
      });
      await expect(agents.access!.tail?.('foreign-session')).rejects.toThrow(
        'Unknown Assignment Session',
      );
      expect(readAssignmentTail).toHaveBeenCalledTimes(1);
      expect(readAssignmentTail).toHaveBeenCalledWith(created.assignment.sessionId);
    } finally {
      await close();
    }
  });

  it('keeps a report read on A when B arrives between pages', async () => {
    const bodies: string[] = [];
    const { agents, admit, close } = await setup({
      saveReportSpill: async ({ content }) => ({
        locator: 'opaque-report',
        bytes: Buffer.byteLength(content),
        retrievalHint: 'Session Query',
      }),
      readAssignmentReportPage: (sessionId, summary, offset, content) =>
        readAssignmentReportPage(
          {
            listEvents: async () => [],
            filterEvents: async () => bodies.map((_, seq) => ({ seq })),
            readEvent: async ({ seq }) => ({
              target: {
                type: 'tool/call',
                data: {
                  name: 'report_to_orchestrator',
                  arguments: JSON.stringify({ summary: bodies[seq] }),
                },
              },
            }),
          },
          sessionId,
          summary,
          offset,
          content,
        ),
    });
    try {
      await admit('Start', 'human-pinned-report');
      const created = agents.access!.create({
        title: 'Report',
        description: 'Read consistently',
        grantId: TEST_GRANT_ID,
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      const run = agents.started[0]!.run;
      const a = 'A😀'.repeat(1500);
      bodies.push(a);
      await run.report({ state: 'progress', summary: a });
      const first = await agents.access!.reportPage!({ sessionId, offset: 0 });
      bodies.push('B😀'.repeat(1500));
      await run.report({ state: 'progress', summary: bodies[1]! });
      const second = await agents.access!.reportPage!({
        sessionId,
        offset: first.nextOffset!,
        reportSourceEventId: first.reportSourceEventId,
      });
      expect(first.text + second.text).toBe(a);
      expect(second.reportSourceEventId).toBe(first.reportSourceEventId);
      const latest = await agents.access!.reportPage!({ sessionId, offset: 0 });
      expect(latest.reportSourceEventId).not.toBe(first.reportSourceEventId);
      expect(latest.text).toBe(Array.from(bodies[1]!).slice(0, 2000).join(''));
      await expect(
        agents.access!.reportPage!({ sessionId, offset: first.nextOffset! }),
      ).rejects.toThrow('REPORT_ID_REQUIRED');
    } finally {
      await close();
    }
  });

  it('only pages accepted reports from the specified owned Assignment', async () => {
    const readAssignmentReportPage = vi.fn(async () => ({
      text: 'first page',
      offset: 0,
      totalCharacters: 10,
      matchedEvents: 1,
      readCount: 1,
      sourceEventBytes: 100,
      returnedCharacters: 10,
      estimatedTokens: 3,
    }));
    const { agents, admit, close } = await setup({ readAssignmentReportPage });
    try {
      await admit('Start', 'human-report-page');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      await agents.started[0]!.run.report({ state: 'completed', summary: 'first page' });
      const page = await agents.access!.reportPage!({ sessionId, offset: 0 });
      expect(page.text).toBe('first page');
      const other = agents.access!.create({
        title: 'Other',
        description: 'Other report',
        grantId: TEST_GRANT_ID,
      });
      if (other.outcome !== 'created') throw new Error('create failed');
      await expect(
        agents.access!.reportPage!({
          sessionId: other.assignment.sessionId,
          offset: 0,
          reportSourceEventId: page.reportSourceEventId,
        }),
      ).rejects.toThrow('REPORT_UNAVAILABLE');
      await expect(
        agents.access!.reportPage!({ sessionId: other.assignment.sessionId, offset: 0 }),
      ).rejects.toThrow('REPORT_UNAVAILABLE');
      await expect(
        agents.access!.reportPage!({
          sessionId,
          offset: -1,
          reportSourceEventId: page.reportSourceEventId,
        }),
      ).rejects.toThrow('Invalid report offset');
      await expect(
        agents.access!.reportPage?.({ sessionId, offset: 0, reportSourceEventId: 'unknown' }),
      ).rejects.toThrow('REPORT_UNAVAILABLE');
      await expect(
        agents.access!.reportPage?.({ sessionId: 'foreign-session', offset: 0 }),
      ).rejects.toThrow('Unknown Assignment Session');
      expect(readAssignmentReportPage).toHaveBeenCalledTimes(1);
      expect(readAssignmentReportPage).toHaveBeenCalledWith(
        sessionId,
        'first page',
        0,
        expect.objectContaining({ version: 1, bytes: 10, sha256: expect.any(String) }),
      );
    } finally {
      await close();
    }
  });

  it('withholds a report purged during the native read and refuses subsequent reads', async () => {
    let purge = () => {};
    const readPage = vi.fn(async () => {
      purge();
      return {
        text: 'private body',
        offset: 0,
        totalCharacters: 12,
        matchedEvents: 1,
        readCount: 1,
        sourceEventBytes: 12,
        returnedCharacters: 12,
        estimatedTokens: 3,
      };
    });
    const { agents, owner, admit, close } = await setup({ readAssignmentReportPage: readPage });
    try {
      await admit('Start', 'human-purge-read');
      const created = agents.access!.create({
        title: 'Report',
        description: 'Purge race',
        grantId: TEST_GRANT_ID,
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      await agents.started[0]!.run.report({ state: 'progress', summary: 'private body' });
      const id = sourceEvents(owner).find(
        (source) => source.source_kind === 'assignment-report',
      )!.source_event_id;
      purge = () =>
        attachOperationalModule(owner, 'purge-read-test').transaction(
          (db) => {
            db.prepare(
              "INSERT INTO messaging_purge_facts SELECT source_event_id, 'dm-ada', source_event_id, created_at, '{}' FROM source_events WHERE source_event_id = ?",
            ).run(id);
          },
          ['source-event'],
        );
      const request = {
        sessionId: created.assignment.sessionId,
        offset: 0,
        reportSourceEventId: id,
      };
      await expect(agents.access!.reportPage!(request)).rejects.toThrow('purged');
      await expect(agents.access!.reportPage!(request)).rejects.toThrow('purged');
      expect(readPage).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  it.each([null, '{}', '{"assignmentReport":{"state":"completed"}}'])(
    'reads historic report payload %s through the owned Runtime path',
    async (payload) => {
      const raw = '  历史报告😀  ';
      const readPage = vi.fn(
        (sessionId: string, summary: string, offset: number, content?: AssignmentReportContent) =>
          readAssignmentReportPage(
            {
              listEvents: async () => [],
              filterEvents: async () => [{ seq: 1 }],
              readEvent: async () => ({
                target: {
                  type: 'tool/call',
                  data: {
                    name: 'report_to_orchestrator',
                    arguments: JSON.stringify({ summary: raw }),
                  },
                },
              }),
            },
            sessionId,
            summary,
            offset,
            content,
          ),
      );
      const { agents, owner, admit, close } = await setup({ readAssignmentReportPage: readPage });
      try {
        await admit('Start', 'human-legacy-report');
        const created = agents.access!.create({
          grantId: TEST_GRANT_ID,
          title: 'Legacy research',
          description: 'Read a historical report',
        });
        if (created.outcome !== 'created') throw new Error('create failed');
        await agents.started[0]!.run.report({ state: 'completed', summary: raw });
        const database = attachOperationalModule(owner, 'legacy-report-fixture');
        database.transaction(
          (db) =>
            db
              .prepare(
                "UPDATE source_events SET payload_json = ? WHERE source_kind = 'assignment-report'",
              )
              .run(payload),
          ['source-event'],
        );
        await expect(
          agents.access!.reportPage?.({ sessionId: created.assignment.sessionId, offset: 0 }),
        ).resolves.toMatchObject({ text: raw.trim() });
        database.transaction(
          (db) =>
            db
              .prepare(
                "UPDATE source_events SET payload_json = ? WHERE source_kind = 'assignment-report'",
              )
              .run('{"assignmentReport":{"content":null}}'),
          ['source-event'],
        );
        await expect(
          agents.access!.reportPage?.({ sessionId: created.assignment.sessionId, offset: 0 }),
        ).rejects.toThrow();
        expect(readPage).toHaveBeenCalledTimes(1);
        database.transaction(
          (db) =>
            db
              .prepare(
                "INSERT INTO messaging_purge_facts SELECT source_event_id, 'dm-ada', source_event_id, created_at, '{}' FROM source_events WHERE source_kind = 'assignment-report'",
              )
              .run(),
          ['source-event'],
        );
        await expect(
          agents.access!.reportPage?.({ sessionId: created.assignment.sessionId, offset: 0 }),
        ).rejects.toThrow('purged');
        expect(readPage).toHaveBeenCalledTimes(1);
      } finally {
        await close();
      }
    },
  );
});
