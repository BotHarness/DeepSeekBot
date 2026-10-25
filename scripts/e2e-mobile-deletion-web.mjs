import assert from 'node:assert/strict';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { createRequire } from 'node:module';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieFor, rpc, verifyPaths } from './verify-app.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const name = process.argv[2] ?? 'mobile-delete';
const paths = verifyPaths(name);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
const host = new URL(instance.url).origin;
const evidence = join(root, '.github/pr-screenshots/2783');
mkdirSync(evidence, { recursive: true });
mkdirSync(paths.evidence, { recursive: true });
const before = join(root, '.humanlayer/tasks/mobile-delete/before-web');
let dist = before;
if (!existsSync(join(before, 'index.html')))
  throw Error('Save the base Expo Web export before running');
const call = (method, args) => rpc(instance, `botharness/${method}`, args);
let authorization;
const types = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};
const proxy = createServer((req, res) => {
  if (req.url.startsWith('/botharness-device/')) {
    if (req.headers.authorization?.startsWith('Device ')) authorization = req.headers.authorization;
    const upstream = request(
      `${host}${req.url}`,
      { method: req.method, headers: req.headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
    return;
  }
  let file = resolve(dist, `.${decodeURIComponent(new URL(req.url, 'http://phone').pathname)}`);
  if (!file.startsWith(`${dist}${sep}`) && file !== dist) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
});
proxy.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/botharness-device/')) return socket.destroy();
  const upstream = connect(Number(new URL(host).port), '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    if (!req.headers.authorization && authorization) lines.push(`authorization: ${authorization}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});
await new Promise((done) => proxy.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${proxy.address().port}`;
const store = join(root, 'node_modules/.pnpm');
const entry = readdirSync(store).find((value) => value.startsWith('puppeteer@'));
const puppeteer = createRequire(join(store, entry, 'node_modules/puppeteer/package.json'))(
  'puppeteer',
);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
const page = await browser.newPage();
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await page.setCacheEnabled(false);
await (await page.createCDPSession()).send('Emulation.setLocaleOverride', { locale: 'en-US' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const waitText = (text) =>
  page.waitForFunction(
    (value) => document.body.innerText.includes(value),
    { timeout: 30_000 },
    text,
  );
const click = (label) => page.locator(`::-p-aria(${label})`).click();
const shot = async (label) => {
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-testid="deletion-memory-path"]'))
      node.style.filter = 'blur(6px)';
  });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await new Promise((done) => setTimeout(done, 150));
    await page.screenshot({ path: join(evidence, `${label}-${scheme}.png`) });
  }
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  writeFileSync(
    join(paths.evidence, `${label}.aria.json`),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};
const hold = async (selector) => {
  const element = await page.waitForSelector(selector);
  await element.scrollIntoView();
  const box = await element.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await new Promise((done) => setTimeout(done, 750));
  await page.mouse.up();
};
try {
  console.log('Preparing isolated deletion fixtures');
  const seedPath = join(paths.dir, 'deletion-fixtures.json');
  if (existsSync(seedPath))
    throw Error('Use a fresh isolated Host name for another destructive journey');
  const { bot: ada } = await call('create', { displayName: 'Ada', roles: ['research'] });
  const { bot: keeper } = await call('create', { displayName: 'Keeper', roles: ['research'] });
  await call('tobHome', {});
  const { channel: group } = await call('channelCreate', {
    name: 'Launch group',
    members: [ada.slug, keeper.slug],
  });
  const { section } = await call('sectionCreate', { name: 'Work' });
  await call('rosterBatch', { action: 'move', channelIds: [group.id], sectionId: section.id });
  writeFileSync(
    seedPath,
    JSON.stringify({ ada: ada.slug, keeper: keeper.slug, group: group.id, section: section.id }),
  );
  const offerResponse = await fetch(`${host}/api/botharness/devices/offer`, {
    method: 'POST',
    headers: { cookie: cookieFor(instance.home), 'content-type': 'application/json' },
    body: JSON.stringify({ origin: host }),
  });
  const offer = await offerResponse.json();
  const payload = JSON.parse(
    Buffer.from(new URL(offer.link).searchParams.get('p'), 'base64url').toString(),
  );
  payload.routes = [origin];
  const link = `deepseekbot://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  await page.goto(origin, { waitUntil: 'networkidle0' });
  await click('Use Tailscale, Scan the pairing code or paste a pairing link.');
  await page.waitForSelector(
    'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
  );
  await page.type(
    'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
    link,
  );
  await click('Pair');
  await waitText('Ada');
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem('deepseekbot.hosts.v3'));
    saved.hosts[0].hostName = 'QA Computer';
    sessionStorage.setItem('deepseekbot.hosts.v3', JSON.stringify(saved));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Ada');
  await shot('before');
  const botSelector = `[data-testid="conversation-row-bot:${ada.slug}"]`;
  await hold(botSelector);
  await shot('before-hold');
  dist = join(root, 'apps/mobile/dist-web');
  await page.goto(origin, { waitUntil: 'networkidle0' });
  await waitText('Work');
  await shot('after');
  await hold(botSelector);
  await waitText('Delete Bot');
  await shot('bot-menu');
  await click('Delete Bot');
  await waitText('Also delete Memory files');
  await shot('bot-review');
  const memory = await call('deletionPreview', { slug: ada.slug });
  await page.locator('[role="switch"]').click();
  assert.equal(await page.$eval('[role="switch"]', (node) => node.checked), true);
  await page.locator('[data-testid="deletion-cancel"]').click();
  await hold(botSelector);
  await click('Delete Bot');
  await waitText('Also delete Memory files');
  assert.equal(await page.$eval('[role="switch"]', (node) => node.checked), false);
  await page.locator('[data-testid="deletion-confirm"]').click();
  await page.waitForFunction((selector) => !document.querySelector(selector), {}, botSelector);
  const deleted = await call('deletionPreview', { slug: ada.slug });
  assert.equal(deleted.preview.deletion.phase, 'complete');
  assert.equal(deleted.preview.deletion.memory, 'retained');
  assert.equal(existsSync(memory.preview.memoryDir), true);
  await hold(`[data-testid="conversation-row-channel:${group.id}"]`);
  await click('Dissolve group');
  await waitText('Chat history stays on the computer.');
  await shot('group-review');
  await page.locator('[data-testid="deletion-cancel"]').click();
  await hold('[data-testid^="chat-section-"]');
  await click('Delete section');
  await waitText('No Bots or conversations are deleted.');
  await shot('section-review');
  await page.locator('[data-testid="deletion-confirm"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid^="chat-section-"]'));
  assert.equal(
    (await call('rosterGet', {})).sections.some((row) => row.id === section.id),
    false,
  );
  assert.ok(await page.$(`[data-testid="conversation-row-channel:${group.id}"]`));
  await hold(`[data-testid="conversation-row-channel:${group.id}"]`);
  await click('Dissolve group');
  await page.locator('[data-testid="deletion-confirm"]').click();
  await page.waitForFunction(
    (id) => !document.querySelector(`[data-testid="conversation-row-channel:${id}"]`),
    {},
    group.id,
  );
  assert.ok((await call('channelHistory', {})).channels.some((row) => row.id === group.id));
  await shot('result');
  const tob = (await call('list', {})).bots.find((bot) => bot.tob);
  assert.ok(tob);
  await hold(`[data-testid="conversation-row-bot:${tob.slug}"]`);
  assert.equal(await page.$('[data-testid="menu-delete"]'), null);
  await page.locator('[aria-label="Close"]').click();
  const { bot: eraser } = await call('create', { displayName: 'Memory sample', roles: [] });
  const erasure = await call('deletionPreview', { slug: eraser.slug });
  assert.equal(erasure.preview.eraseAvailable, true);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Memory sample');
  await hold(`[data-testid="conversation-row-bot:${eraser.slug}"]`);
  await click('Delete Bot');
  await waitText('Also delete Memory files');
  await page.locator('[role="switch"]').click();
  await shot('erase-review');
  await page.locator('[data-testid="deletion-confirm"]').click();
  await page.waitForFunction(
    (slug) => !document.querySelector(`[data-testid="conversation-row-bot:${slug}"]`),
    {},
    eraser.slug,
  );
  assert.equal(
    (await call('deletionPreview', { slug: eraser.slug })).preview.deletion.memory,
    'erased',
  );
  assert.equal(existsSync(erasure.preview.memoryDir), false);
  assert.deepEqual(errors, []);
  writeFileSync(
    join(paths.evidence, 'result.json'),
    JSON.stringify(
      {
        result: 'pass',
        botMemoryRetained: true,
        explicitMemoryErased: true,
        tobProtected: true,
        sectionMembersRetained: true,
        groupHistoryRetained: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: mobile deletion, section retention, group history, Memory reset, and matched Expo Web captures',
  );
} catch (error) {
  await page.screenshot({ path: join(paths.evidence, 'failure.png') });
  writeFileSync(
    join(paths.evidence, 'failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  writeFileSync(join(paths.evidence, 'console.json'), JSON.stringify(errors));
  throw error;
} finally {
  await browser.close();
  proxy.closeAllConnections();
  proxy.close();
}
