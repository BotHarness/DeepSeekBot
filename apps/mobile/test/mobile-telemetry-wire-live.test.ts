import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createMobileTelemetry } from '../src/telemetry/mobile-telemetry';
import { isUuid, record, type TelemetryEvent } from '../src/telemetry/schema';

const configPath = process.env.BH_MOBILE_WIRE_QA_CONFIG;

it.skipIf(!configPath)(
  'sends tagged synthetic owner events through the real SDK/proxy (wire only, not native QA)',
  async () => {
    if (!configPath) throw new Error('Missing explicit wire QA configuration');
    const config = record(JSON.parse(readFileSync(configPath, 'utf8')));
    const token = config['publicIngestionToken'];
    const qaRun = config['qaRun'];
    if (typeof token !== 'string' || !token.startsWith('phc_') || !isUuid(qaRun))
      throw new Error('Wire QA requires a public ingestion token and a fresh UUID tag');
    const require = createRequire(import.meta.url);
    const shim = require('./posthog-native-shim.cjs');
    const { createPostHogSender } = await import('../src/telemetry/posthog-sender');
    shim.restore();
    const sent: TelemetryEvent[] = [];
    const requests: { status: number; events: number }[] = [];
    const transport = createPostHogSender({
      token,
      request: async (url, init) => {
        if (typeof init.body !== 'string') throw new Error('Expected uncompressed SDK wire body');
        const response = await fetch(url, {
          method: init.method,
          headers: init.headers,
          body: init.body,
          signal: init.signal ?? null,
        });
        const batch: TelemetryEvent[] = JSON.parse(String(init.body)).batch;
        sent.push(...batch);
        requests.push({ status: response.status, events: batch.length });
        return response;
      },
    });
    const telemetry = createMobileTelemetry({
      storage: { read: async () => undefined, write: () => {} },
      sender: transport.send,
      uuid: randomUUID,
      now: Date.now,
      monotonic: () => performance.now(),
      context: {
        platform: 'android',
        app_version: 'unknown',
        app_build: 'unknown',
        environment: 'development',
        language: 'en',
        qa_run_id: qaRun,
      },
    });
    try {
      await telemetry.ready;
      telemetry.foreground(true, 0);
      telemetry.pairing('paste').finish('success');
      telemetry.connection('pair').finish('ready');
      const send = telemetry.send('dm');
      send.accepted();
      send.observed();
      await telemetry.flush();
      writeFileSync(
        join(dirname(configPath), 'wire-expected.json'),
        JSON.stringify({ proof: 'synthetic-owner-wire-only', qaRun, requests, sent }, null, 2),
      );
      expect(requests).toEqual([{ status: 200, events: 7 }]);
      expect(new Set(sent.map((event) => event.event)).size).toBe(5);
      expect(
        sent.every(
          (event) =>
            event.properties.qa_run_id === qaRun && event.properties.environment === 'development',
        ),
      ).toBe(true);
      expect(new Set(sent.map((event) => event.uuid)).size).toBe(7);
    } finally {
      telemetry.dispose();
      await transport.clear();
    }
  },
  20_000,
);
