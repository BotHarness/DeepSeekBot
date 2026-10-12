import { appendFileSync, readFileSync } from 'node:fs';

const evidence = process.env.BOTHARNESS_PRIVATE_WIRE_EVIDENCE;
if (!evidence) throw new Error('Set BOTHARNESS_PRIVATE_WIRE_EVIDENCE to a task-owned file');
const canaries = process.env.BOTHARNESS_PRIVATE_CANARY_FILE
  ? JSON.parse(readFileSync(process.env.BOTHARNESS_PRIVATE_CANARY_FILE, 'utf8'))
  : [
      'SYNTHETIC-1380-key-A',
      'SYNTHETIC-1380-secret-A',
      'SYNTHETIC-1380-url-A',
      'http://127.0.0.1:31381/status?marker=SYNTHETIC-1380-url-A',
    ];
if (
  !Array.isArray(canaries) ||
  canaries.length === 0 ||
  canaries.length > 32 ||
  !canaries.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 16384)
)
  throw new Error('Invalid synthetic canary list');
const patterns = [
  ...new Set(
    canaries.flatMap((value) => [
      value,
      Buffer.from(value).toString('base64'),
      encodeURIComponent(value),
    ]),
  ),
];
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const endpoint = new URL(url);
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (method === 'POST' && /\/(messages|chat\/completions|responses)$/.test(endpoint.pathname)) {
    const body =
      typeof init?.body === 'string'
        ? init.body
        : init?.body !== undefined
          ? undefined
          : input instanceof Request
            ? await input.clone().text()
            : undefined;
    appendFileSync(
      evidence,
      JSON.stringify({
        phase: 'model-wire-request',
        bodyAvailable: body !== undefined,
        bodyBytes: body === undefined ? 0 : Buffer.byteLength(body),
        canaryMatches:
          body === undefined ? null : patterns.filter((pattern) => body.includes(pattern)).length,
      }) + '\n',
    );
  }
  return original(input, init);
};
