import { afterEach, expect, it, vi } from 'vitest';
import { feedbackUploader } from '../src/diagnostics/feedback-upload.js';
import { TELEMETRY_ENDPOINT } from '../src/telemetry/service.js';

afterEach(() => vi.unstubAllGlobals());
it.each([
  { status: 0 },
  { status: 1, quota_limited: ['events'] },
  { status: 1, quota_limited: {} },
  null,
])('refuses a non-accepting HTTP 200 acknowledgement %j', async (body) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body)),
  );
  await expect(
    feedbackUploader()({
      reportId: 'c64d7cc6-dfbe-4eea-a898-952fe5122778',
      version: 'test',
      feedback: { rating: 'good', tags: [], comment: '' },
    }),
  ).rejects.toThrow();
});
it.each([1, 'Ok'])('sends only the explicit rating with a stable ID (ack %s)', async (status) => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ status }));
  vi.stubGlobal('fetch', request);
  const send = feedbackUploader();
  const report = {
    reportId: 'c64d7cc6-dfbe-4eea-a898-952fe5122778',
    version: 'test',
    feedback: { rating: 'bad' as const, tags: ['slow'], comment: 'Slow reply' },
  };
  expect(await send(report)).toEqual({ reportId: report.reportId });
  expect(request.mock.calls[0]?.[0]).toBe(TELEMETRY_ENDPOINT);
  const init = request.mock.calls[0]?.[1];
  const body = JSON.parse(String(init?.body));
  expect(body.batch[0]).toEqual({
    event: 'message_feedback',
    uuid: report.reportId,
    distinct_id: report.reportId,
    properties: {
      $process_person_profile: false,
      $geoip_disable: true,
      feedback_id: report.reportId,
      rating: 'bad',
      tags: ['slow'],
      comment: 'Slow reply',
      version: 'test',
    },
  });
  expect(init?.redirect).toBe('error');
});
it('refuses unsuccessful ingestion instead of claiming a receipt', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  await expect(
    feedbackUploader()({
      reportId: 'c64d7cc6-dfbe-4eea-a898-952fe5122778',
      version: 'test',
      feedback: { rating: 'good', tags: [], comment: '' },
    }),
  ).rejects.toThrow();
});

it('includes explicitly selected turn evidence without the diagnostic archive', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ status: 1 }));
  vi.stubGlobal('fetch', request);
  const turn = {
    prompt: ['Synthetic QA prompt'],
    toolCalls: [{ type: 'tool/call' as const, data: { name: 'read' } }],
  };
  await feedbackUploader()({
    reportId: 'test',
    version: 'test',
    feedback: { rating: 'bad', tags: [], comment: '' },
    turn,
  });
  const properties = JSON.parse(String(request.mock.calls[0]?.[1]?.body)).batch[0].properties;
  expect(properties.failed_turn).toEqual(turn);
  expect(properties.archive).toBeUndefined();
});
