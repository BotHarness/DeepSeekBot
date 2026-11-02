import { describe, expect, it } from 'vitest';

import {
  diagnosticEventRow,
  diagnosticEventRecorder,
  diagnosticLogView,
  hostLogExporter,
} from '../src/diagnostics/diagnostic-log.js';
import { createTurnLog } from '../src/diagnostics/turn-log.js';
import { LOG_DETAIL_MAX_CHARS, type LogEntryInput } from '../src/logs/log-db.js';

function harness() {
  const rows: LogEntryInput[] = [];
  const events = diagnosticEventRecorder((batch) => rows.push(...batch), { now: () => 5000 });
  const turns = createTurnLog({
    events,
    owner: (sessionId) =>
      sessionId === 's1' ? { botSlug: 'ada', rootRole: 'orchestrator' } : undefined,
  });
  const views = () =>
    rows.map((row, index) => diagnosticLogView({ id: index + 1, ts: row.ts ?? 0, ...row }));
  return { rows, turns, views };
}

const at = (type: string, time: number, data: unknown) => ({ type, time, data });

describe('Bot turn diagnostics', () => {
  it('records one row per turn with model, timing, tools and outcome but no content', () => {
    const { turns, views, rows } = harness();
    turns.observe(
      's1',
      at('request/header', 0, {
        header: { config: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' } },
      }),
    );
    turns.observe('s1', at('turn/start', 1000, { turn: 3 }));
    turns.observe('s1', at('step/start', 1001, { turn: 3, step: 0 }));
    turns.observe(
      's1',
      at('assistant/message', 1500, {
        message: { role: 'assistant', content: 'secret answer' },
        stream: [],
        usage: { inputTokens: 120, outputTokens: 30 },
      }),
    );
    turns.observe(
      's1',
      at('tool/call', 1600, { callId: 'c1', name: 'bash', arguments: '{"cmd":"ls"}' }),
    );
    turns.observe(
      's1',
      at('tool/result', 2600, {
        message: { role: 'tool', toolCallId: 'c1', isError: true, content: 'denied' },
        error: { name: 'ToolError', code: 'permission-denied' },
      }),
    );
    turns.observe('s1', at('turn/end', 4200, { turn: 3, reason: { kind: 'completed' } }));
    expect(rows[0]).toMatchObject({
      plugin: 'bot-turn',
      kind: 'completed',
      owner: 'bot:ada',
      bot: 'ada',
    });
    expect(views()[0]).toMatchObject({
      source: 'bot-turn',
      category: 'module',
      level: 'info',
      code: 'completed',
      fields: {
        session: 's1',
        turn: 3,
        role: 'orchestrator',
        durationMs: 3200,
        modelMs: 499,
        steps: 1,
        tools: 1,
        toolErrors: 1,
        lastToolError: 'bash:permission-denied',
        slowestTool: 'bash',
        slowestToolMs: 1000,
        provider: 'opencode-go',
        model: 'deepseek-v4.1-flash',
        inputTokens: 120,
        outputTokens: 30,
      },
    });
    expect(JSON.stringify(rows)).not.toMatch(/secret answer|denied"|"cmd"/u);
  });

  it('marks a failed turn as a warning with its error code', () => {
    const { turns, views } = harness();
    turns.observe('s2', at('turn/start', 0, { turn: 1 }));
    turns.observe(
      's2',
      at('turn/end', 900, {
        turn: 1,
        reason: { kind: 'error', error: { code: 'INVALID_CREDENTIAL', message: 'x', status: 401 } },
      }),
    );
    expect(views()[0]).toMatchObject({
      code: 'error',
      level: 'warn',
      fields: { role: 'unowned', errorCode: 'INVALID_CREDENTIAL', status: 401, durationMs: 900 },
    });
  });
});

describe('structured Host events', () => {
  it('turns a JSON warn line into a module row with fields and a computed level', () => {
    const rows: LogEntryInput[] = [];
    const exporter = hostLogExporter((batch) => rows.push(...batch), { home: '/Users/vain' });
    const line = (fields: Record<string, unknown>) => ({
      sn: 1,
      ts: 10,
      type: 'warn' as const,
      level: 1,
      name: 'botharness',
      args: [JSON.stringify(fields)],
    });
    exporter.export(
      line({
        event: 'messaging-outbox',
        phase: 'settled',
        state: 'provider-accepted',
        durationMs: 420,
      }),
    );
    exporter.export(
      line({
        event: 'messaging-outbox',
        phase: 'settled',
        state: 'unknown-outcome',
        reason: 'provider-result-unknown',
        path: '/Users/vain/x',
      }),
    );
    const views = rows.map((row, index) =>
      diagnosticLogView({ id: index, ts: row.ts ?? 0, ...row }),
    );
    expect(views[0]).toMatchObject({
      source: 'messaging-outbox',
      code: 'settled',
      level: 'info',
      fields: { state: 'provider-accepted', durationMs: 420 },
    });
    expect(views[1]).toMatchObject({ level: 'warn', fields: { path: '~/x' } });
  });

  it('keeps a structured row parseable when its fields would overflow the detail limit', () => {
    const fields = Object.fromEntries(
      Array.from({ length: 24 }, (_, index) => [`f${index}`, '"'.repeat(300)]),
    );
    const row = diagnosticEventRow('bot-turn', 'completed', { ...fields, durationMs: 9 }, {});
    expect(row?.detail.length).toBeLessThanOrEqual(LOG_DETAIL_MAX_CHARS);
    const view = diagnosticLogView({ id: 1, ts: 0, ...row! });
    expect(view.fields).toMatchObject({ f0: expect.any(String) });
  });
});
