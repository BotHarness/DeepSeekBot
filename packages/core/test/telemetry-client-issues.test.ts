import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ClientLogEntry } from '../src/diagnostics/diagnostic-log.js';
import {
  CLIENT_ISSUE_LIMITS,
  clientStackFrames,
  createClientIssueReporter,
} from '../src/telemetry/client-issues.js';
import {
  createTelemetryService,
  type TelemetryBatch,
  type TelemetryExceptionEntry,
} from '../src/telemetry/service.js';

function fakeTelemetry(enabled = true) {
  const events: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  const exceptions: TelemetryExceptionEntry[] = [];
  return {
    events,
    exceptions,
    telemetry: {
      enabled,
      capture: (event: string, properties?: Record<string, unknown>) =>
        events.push({ event, ...(properties === undefined ? {} : { properties }) }),
      captureException: (exception: TelemetryExceptionEntry) => exceptions.push(exception),
    } as never,
  };
}

const entry = (
  code: string,
  fields: ClientLogEntry['fields'] = {},
  level: ClientLogEntry['level'] = 'error',
  category: ClientLogEntry['category'] = 'error',
): ClientLogEntry => ({ ts: 1, category, level, code, fields });

const STACK =
  'at renderRow (/assets/index-a1b2.js:10:20) | at async load (/Users/vain/app/assets/index-a1b2.js:4:2)';

describe('Client issue reports', () => {
  it('reports each kind once per Client session, without message text', () => {
    const { telemetry, events } = fakeTelemetry();
    const reporter = createClientIssueReporter({ telemetry, now: () => 0 });
    reporter.observe('session-a', [
      entry(
        'rpc-failed',
        { endpoint: 'channelsList', message: 'secret prompt', ms: 1200 },
        'warn',
        'network',
      ),
      entry('rpc-failed', { message: 'again' }, 'warn', 'network'),
      entry('click', {}, 'info', 'action'),
      entry('long-frame', { ms: 4200 }, 'warn', 'perf'),
      entry('long-frame', { ms: 300 }, 'info', 'perf'),
      entry('timeline-groups-lost', { message: 'lost' }, 'warn', 'invariant'),
    ]);
    reporter.observe('session-b', [entry('rpc-failed', {}, 'warn', 'network')]);
    expect(events).toEqual([
      {
        event: 'app:client_issue_report',
        properties: { kind: 'rpc_failed', duration_bucket: '1s_3s' },
      },
      {
        event: 'app:client_issue_report',
        properties: { kind: 'long_task', duration_bucket: '3s_10s' },
      },
      { event: 'app:client_issue_report', properties: { kind: 'invariant' } },
      { event: 'app:client_issue_report', properties: { kind: 'rpc_failed' } },
    ]);
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('sends an uncaught Client error as $exception with file names only', () => {
    const { telemetry, exceptions } = fakeTelemetry();
    const reporter = createClientIssueReporter({ telemetry, now: () => 0 });
    reporter.observe('session-a', [
      entry('uncaught-error', { name: 'TypeError', message: 'token sk-123', stack: STACK }),
      entry('uncaught-error', { name: 'TypeError', message: 'again', stack: STACK }),
      entry('unhandled-rejection', { message: 'no stack' }),
      entry('unhandled-rejection', {
        name: 'Error',
        stack: 'at inject (chrome-extension://abc/content.js:1:2) | at eval (<anonymous>:1:1)',
      }),
    ]);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({
      type: 'TypeError',
      mechanism: { type: 'onerror', handled: false },
    });
    expect(exceptions[0]!.stacktrace.frames.map((frame) => frame.filename)).toEqual([
      'index-a1b2.js',
      'index-a1b2.js',
    ]);
    const text = JSON.stringify(exceptions);
    expect(text).not.toContain('vain');
    expect(text).not.toContain('sk-123');
  });

  it('parses Gecko frames and drops unreadable ones', () => {
    expect(clientStackFrames('load@http://x/assets/app.js:3:9 | garbage')).toEqual([
      expect.objectContaining({ function: 'load', filename: 'app.js', lineno: 3, colno: 9 }),
    ]);
  });

  it('stays silent when telemetry is off and caps reports per hour', () => {
    const off = fakeTelemetry(false);
    createClientIssueReporter({ telemetry: off.telemetry }).observe('s', [entry('uncaught-error')]);
    expect(off.events).toHaveLength(0);
    const on = fakeTelemetry();
    const reporter = createClientIssueReporter({ telemetry: on.telemetry, now: () => 0 });
    for (let index = 0; index < CLIENT_ISSUE_LIMITS.reportsPerHour + 5; index += 1)
      reporter.observe(`session-${index}`, [entry('console-error')]);
    expect(on.events).toHaveLength(CLIENT_ISSUE_LIMITS.reportsPerHour);
  });
});

describe('Client issue events through the telemetry service', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('passes the registered event and the web exception to the batch', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'client-issues-'));
    dirs.push(dataDir);
    const batches: TelemetryBatch[] = [];
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir,
      send: async (batch) => {
        batches.push(batch);
      },
      context: () => ({
        pluginVersion: '1.0.0',
        os: 'linux',
        arch: 'x64',
        nodeVersion: 'v22.0.0',
        osRelease: '6.0',
        cpuCount: 4,
        totalMemory: 8e9,
      }),
      flushDelayMs: 60_000,
    });
    createClientIssueReporter({ telemetry }).observe('session-a', [
      entry('unhandled-rejection', { name: 'Error', stack: STACK }),
    ]);
    await telemetry.flush();
    const sent = batches.flatMap((batch) => batch.batch);
    expect(sent.map((event) => event.event)).toEqual(['app:client_issue_report', '$exception']);
    expect(sent[0]!.properties).toMatchObject({ kind: 'unhandled_rejection', source: 'host' });
    expect(sent[1]!.properties['$exception_list']).toEqual([
      expect.objectContaining({ mechanism: { type: 'onunhandledrejection', handled: false } }),
    ]);
  });
});
