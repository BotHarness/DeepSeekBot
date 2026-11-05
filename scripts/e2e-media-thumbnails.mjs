import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const load = (prefix, name) => {
  const dir = readdirSync(pnpm).find((entry) => entry.startsWith(`${prefix}@`));
  if (!dir) throw new Error(`${name} is unavailable`);
  return createRequire(resolve(pnpm, dir, 'node_modules/'))(name);
};
const puppeteer = load('puppeteer', 'puppeteer');
const sharp = load('sharp', 'sharp');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3102';
const nonce = Date.now();

const width = 2400;
const height = 1600;
const seed = randomBytes((width / 10) * (height / 10) * 3);
const png = await sharp(seed, { raw: { width: width / 10, height: height / 10, channels: 3 } })
  .resize(width, height, { kernel: 'cubic' })
  .png()
  .toBuffer();

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

try {
  const page = await browser.newPage();
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  const rpc = (method, args) =>
    page.evaluate(
      async ({ method, args }) => {
        const response = await fetch(`/api/botharness/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `media-${Math.random()}`,
            method: `botharness/${method}`,
            payload: { args },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true) throw new Error(JSON.stringify(envelope.result));
        return envelope.result.value;
      },
      { method, args },
    );
  const get = (query, headers = {}) =>
    page.evaluate(
      async ({ query, headers }) => {
        const started = performance.now();
        const response = await fetch(`/api/botharness/attachment?${query}`, {
          headers,
          cache: 'no-store',
        });
        const bytes = response.status === 200 ? (await response.arrayBuffer()).byteLength : 0;
        return {
          status: response.status,
          bytes,
          type: response.headers.get('content-type'),
          cache: response.headers.get('cache-control'),
          etag: response.headers.get('etag'),
          ms: Math.round(performance.now() - started),
        };
      },
      { query, headers },
    );

  const bot = (await rpc('create', { displayName: `MediaThumbs-${nonce}` })).bot;
  const channel = (await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName }))
    .channel;
  const uploaded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const response = await fetch('/api/botharness/attachment/upload?name=media-thumbs.png', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes,
    });
    if (!response.ok) throw new Error(`upload failed: ${response.status}`);
    return response.json();
  }, png.toString('base64'));
  const sent = await rpc('channelSend', {
    channelId: channel.id,
    body: 'media thumbnails e2e',
    attachments: [uploaded.attachment],
  });
  const messageId = sent.message?.id ?? sent.id;

  const deadline = Date.now() + 30000;
  let attachment;
  while (Date.now() < deadline) {
    const timeline = await rpc('channelTimeline', { channelId: channel.id });
    attachment = timeline.page.entries
      .flatMap((entry) => entry.attachments ?? [])
      .find((ref) => ref.fileId === uploaded.attachment.fileId);
    if (attachment?.version && attachment?.thumbhash) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(attachment?.version, 'timeline attachment has no content version');
  expect(attachment?.width === width && attachment?.height === height, 'dimensions missing');
  expect(attachment?.thumbhash, 'thumbhash missing');

  const base = `channelId=${encodeURIComponent(channel.id)}&messageId=${encodeURIComponent(messageId)}&fileId=${encodeURIComponent(attachment.fileId)}`;
  const legacy = await get(base);
  const original = await get(`${base}&v=${attachment.version}`);
  const variants = {};
  for (const variant of ['96c', '320', '800'])
    variants[variant] = await get(`${base}&v=${attachment.version}&variant=${variant}`);
  const revalidated = await get(`${base}&v=${attachment.version}&variant=320`, {
    'if-none-match': variants['320'].etag,
  });
  const resume = await page.evaluate(
    async ({ query, size }) => {
      const part = async (range) => {
        const response = await fetch(`/api/botharness/attachment?${query}`, { headers: { range } });
        return {
          status: response.status,
          range: response.headers.get('content-range'),
          bytes: new Uint8Array(await response.arrayBuffer()),
        };
      };
      const whole = new Uint8Array(
        await (await fetch(`/api/botharness/attachment?${query}`)).arrayBuffer(),
      );
      const half = Math.floor(size / 2);
      const first = await part(`bytes=0-${half - 1}`);
      const second = await part(`bytes=${half}-`);
      const joined = new Uint8Array(first.bytes.length + second.bytes.length);
      joined.set(first.bytes);
      joined.set(second.bytes, first.bytes.length);
      const same = joined.length === whole.length && joined.every((byte, i) => byte === whole[i]);
      return { statuses: [first.status, second.status], range: second.range, same };
    },
    { query: `${base}&v=${attachment.version}`, size: original.bytes },
  );
  const stale = await get(`${base}&v=${'0'.repeat(32)}&variant=320`);

  expect(legacy.status === 200 && legacy.cache === 'no-store', 'unversioned original changed');
  expect(original.cache?.includes('immutable'), 'versioned original is not immutable');
  for (const [variant, response] of Object.entries(variants)) {
    expect(response.status === 200 && response.type === 'image/webp', `${variant} not WebP`);
    expect(response.cache?.includes('immutable'), `${variant} not immutable`);
    expect(response.bytes < original.bytes / 10, `${variant} is not much smaller`);
  }
  expect(
    resume.statuses.every((status) => status === 206) && resume.same,
    'range resume did not rebuild the original',
  );
  expect(revalidated.status === 304, 'ETag revalidation did not return 304');
  expect(stale.status === 409 && stale.cache === 'no-store', 'stale version not refused');

  console.log(
    JSON.stringify(
      {
        verdict: failures.length === 0 ? 'PASS' : 'FAIL',
        failures,
        bytes: {
          original: original.bytes,
          '96c': variants['96c'].bytes,
          320: variants['320'].bytes,
          800: variants['800'].bytes,
        },
        ms: { original: original.ms, 800: variants['800'].ms, revalidated: revalidated.ms },
        statuses: { revalidated: revalidated.status, stale: stale.status, resume: resume.statuses },
        resumeRange: resume.range,
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(String(error?.stack ?? error).replace(/token=[^&\s]+/g, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
