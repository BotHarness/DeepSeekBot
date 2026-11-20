import { createRequire } from 'node:module';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const w = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.argv[2] ?? 'prepare';
if (!process.env.BH_E2E_INSTANCE || !process.env.BH_E2E_FIXTURE)
  throw new Error('Set private BH_E2E_INSTANCE and BH_E2E_FIXTURE paths');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const fixturePath = process.env.BH_E2E_FIXTURE;
const out = resolve(process.env.BH_E2E_OUTPUT ?? join(w, '.humanlayer/tasks/576-real-attachments'));
mkdirSync(out, { recursive: true });
const local = dirname(fixturePath);
const source = join(local, 'source', '报告 notes.txt');
const initial = 'Attachment current-file QA\nOriginal transferred bytes.\n';
const saved = 'Attachment current-file QA\nSaved in TextEdit — current destination bytes.\n';
const p = join(w, 'node_modules/.pnpm');
const puppeteer = createRequire(
  join(
    p,
    readdirSync(p).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.BH_E2E_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.setViewport({ width: 1440, height: 960 });
const rpc = (method, args = {}) =>
  page.evaluate(
    async (m, a) => {
      const envelope = await (
        await fetch('/api/botharness/' + m, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'qa-' + m,
            method: 'botharness/' + m,
            payload: { args: a },
          }),
        })
      ).json();
      if (!envelope.result?.ok) throw new Error(JSON.stringify(envelope.result));
      return envelope.result.value;
    },
    method,
    args,
  );
const clickText = async (selector, text) => {
  await page.waitForFunction(
    (s, t) => [...document.querySelectorAll(s)].some((e) => e.textContent?.includes(t)),
    {},
    selector,
    text,
  );
  await page.evaluate(
    (s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t)).click(),
    selector,
    text,
  );
};
const menuReady = () =>
  page.waitForFunction(() => {
    const menu = document.querySelector('[role="menu"]');
    return (
      menu &&
      !menu.textContent.includes('正在检查') &&
      [...menu.querySelectorAll('button')].some((e) => e.textContent.includes('复制'))
    );
  });
const snapshot = () => {
  const db = new DatabaseSync(join(instance.home, 'botharness/botharness.db'), { readOnly: true });
  try {
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    const counts = Object.fromEntries(
      rows.map(({ name }) => [
        name,
        db.prepare('SELECT COUNT(*) AS count FROM "' + name.replaceAll('"', '""') + '"').get()
          .count,
      ]),
    );
    return JSON.parse(
      JSON.stringify({
        counts,
        messages: db
          .prepare(
            'SELECT source_event_id, body, payload_json FROM source_events ORDER BY source_event_id',
          )
          .all(),
        admissions: db
          .prepare('SELECT * FROM inbox_admissions ORDER BY source_event_id, bot_slug')
          .all(),
      }),
    );
  } finally {
    db.close();
  }
};
const url = (f, messageId = f.messageId, ref = f.ref) =>
  '/api/botharness/attachment?' +
  new URLSearchParams({ channelId: f.channelId, messageId, fileId: ref.fileId });
const bytes = async (path) =>
  page.evaluate(async (u) => {
    const response = await fetch(u);
    return {
      status: response.status,
      text: await response.text(),
      type: response.headers.get('content-type'),
      cache: response.headers.get('cache-control'),
    };
  }, path);
const attach = async (path) => {
  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('button.bh-composer-add-file'),
  ]);
  await chooser.accept([path]);
  await page.waitForFunction(
    () => document.querySelector('button.bh-send-btn')?.disabled === false,
  );
  await page.click('button.bh-send-btn');
  await page.waitForFunction(
    () =>
      !document.querySelector('.bh-bubble-pending') && !document.querySelector('.bh-bubble-failed'),
  );
  await page.waitForNetworkIdle({ idleTime: 500 });
};
let fixture;
try {
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((e) => ['Continue', '继续'].includes(e.textContent.trim()))
      ?.click(),
  );
  if (phase === 'image') {
    const imageSource = join(local, 'image-qa.png');
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'navy';
      ctx.fillRect(0, 0, 320, 160);
      ctx.fillStyle = 'white';
      ctx.font = '22px sans-serif';
      ctx.fillText('Current file image QA', 24, 84);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    writeFileSync(imageSource, Buffer.from(data, 'base64'));
    const { channel } = await rpc('channelCreate', { name: 'Image File Actions QA', members: [] });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
    await clickText('.bh-root button', 'Image File Actions QA');
    await page.waitForSelector('input.bh-composer-file-input');
    await page.waitForNetworkIdle({ idleTime: 500 });
    await attach(imageSource);
    await page.waitForFunction(
      () => document.querySelector('img.bh-message-image')?.naturalWidth === 320,
    );
    const message = (await rpc('channelTimeline', { channelId: channel.id })).page.entries.find(
      (entry) => entry.attachments?.[0]?.name === 'image-qa.png',
    );
    const ref = message.attachments[0];
    assert.equal(ref.mime, 'image/png');
    const prefix = ref.fileId === undefined ? 'before-image' : 'after-image';
    const clip = { x: 280, y: 0, width: 1160, height: 960 };
    await page.screenshot({ path: join(out, prefix + '-dark.png'), clip });
    const href = await page.$eval('a.bh-message-image-link', (anchor) => anchor.href);
    const imageRead = await page.evaluate(async (u) => {
      const response = await fetch(u);
      const data = new Uint8Array(await response.arrayBuffer());
      return {
        status: response.status,
        mime: response.headers.get('content-type'),
        bytes: Array.from(data),
      };
    }, href);
    assert.equal(imageRead.status, 200);
    assert.equal(imageRead.mime, 'image/png');
    assert.deepEqual(Buffer.from(imageRead.bytes), readFileSync(imageSource));
    const popupPromise = browser.waitForTarget((target) => target.url() === href);
    await page.click('a.bh-message-image-link');
    const preview = await (await popupPromise).page();
    await preview.waitForFunction(() => document.querySelector('img')?.naturalWidth === 320);
    await preview.close();
    await page.bringToFront();
    await page.click('a.bh-message-image-link', { button: 'right' });
    await page.waitForSelector('[role="menu"]');
    if (ref.fileId !== undefined) await menuReady();
    await page.screenshot({ path: join(out, prefix + '-menu-dark.png'), clip });
    await page.keyboard.press('Escape');
    if (ref.fileId !== undefined) {
      await page.click('button[aria-label="文件操作: image-qa.png"]');
      await menuReady();
      assert.ok(
        (await page.$eval('[role="menu"]', (menu) => menu.textContent)).includes('显示文件位置'),
      );
      await page.keyboard.press('Escape');
    }
    console.log(
      'PASS ' +
        prefix +
        ': actual PNG picker, MIME, byte-preserving inline display and preview, image context/More menus.',
    );
  } else if (phase === 'prepare') {
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, initial);
    for (let index = 0; index < 2; index += 1) {
      const { bot } = await rpc('create', {
        displayName: 'Real Attachment QA',
        roles: ['research'],
        workspaces: [],
      });
      await rpc('pause', { slug: bot.slug });
      await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
    }
    const { channel } = await rpc('channelCreate', {
      name: 'Real Attachment Files QA',
      members: [],
    });
    fixture = { channelId: channel.id, source };
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
    await clickText('.bh-root button', 'Real Attachment Files QA');
    await page.waitForSelector('input.bh-composer-file-input');
    await page.waitForNetworkIdle({ idleTime: 500 });
    await attach(source);
    const { page: timeline } = await rpc('channelTimeline', { channelId: channel.id });
    const message = timeline.entries.find((e) => e.attachments?.[0]?.name === '报告 notes.txt');
    assert.ok(
      message && message.attachments[0].fileId && message.attachments[0].hash === undefined,
    );
    fixture = { ...fixture, messageId: message.id, ref: message.attachments[0] };
    const { target } = await rpc('messageAttachmentTarget', {
      channelId: fixture.channelId,
      messageId: fixture.messageId,
      fileId: fixture.ref.fileId,
    });
    assert.ok(resolve(target.path).startsWith(resolve(instance.home) + sep));
    assert.equal(readFileSync(target.path, 'utf8'), initial);
    fixture.path = target.path;
    writeFileSync(fixturePath, JSON.stringify(fixture));
    await page.screenshot({ path: join(out, 'after-dark.png') });
    await page.click('button.bh-message-file');
    await menuReady();
    await page.screenshot({ path: join(out, 'after-menu-dark.png') });
    await page.keyboard.press('Escape');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.waitForFunction(() => !document.body.hasAttribute('data-ds-dark-theme'));
    await page.screenshot({ path: join(out, 'after-light.png') });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
    await browser
      .defaultBrowserContext()
      .overridePermissions(new URL(instance.url).origin, [
        'clipboard-read',
        'clipboard-sanitized-write',
      ]);
    await page.bringToFront();
    await page.click('button.bh-message-file');
    await menuReady();
    await clickText('[role="menu"] button', '复制');
    await page.waitForFunction(() =>
      document.querySelector('[role="status"]')?.textContent.includes('已复制'),
    );
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixture.path);
    const downloadDir = join(local, 'downloads');
    mkdirSync(downloadDir, { recursive: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await page.click('button.bh-message-file');
    await menuReady();
    await clickText('[role="menu"] button', '下载');
    const downloaded = join(downloadDir, fixture.ref.name);
    const complete = () =>
      existsSync(downloaded) &&
      !readdirSync(downloadDir).some((name) => name.endsWith('.crdownload'));
    for (let count = 0; count < 100 && !complete(); count += 1)
      await new Promise((done) => setTimeout(done, 100));
    assert.ok(complete(), 'Browser download did not complete within 10s');
    assert.equal(readFileSync(downloaded, 'utf8'), initial);
    await attach(source);
    const secondTimeline = (await rpc('channelTimeline', { channelId: channel.id })).page.entries;
    const independent = secondTimeline.find(
      (e) => e.id !== fixture.messageId && e.attachments?.[0]?.name === fixture.ref.name,
    );
    assert.ok(independent);
    fixture.independentMessageId = independent.id;
    fixture.independentRef = independent.attachments[0];
    assert.notEqual(fixture.independentRef.fileId, fixture.ref.fileId);
    const uploadId = 'eb2e392f-8525-4d9d-8135-3899141ed39c';
    const retry = () =>
      page.evaluate(
        async (id, text) =>
          (
            await (
              await fetch(
                '/api/botharness/attachment/upload?' +
                  new URLSearchParams({ name: 'retry.txt', uploadId: id }),
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/octet-stream' },
                  body: text,
                },
              )
            ).json()
          ).attachment,
        uploadId,
        'retry transfer',
      );
    assert.deepEqual(await retry(), await retry());
    await page.click('button.bh-message-file');
    await menuReady();
    fixture.authority = snapshot();
    writeFileSync(fixturePath, JSON.stringify(fixture));
    await clickText('[role="menu"] button', '文本编辑');
    await page.waitForSelector('[role="menu"]', { hidden: true });
    await page.waitForNetworkIdle({ idleTime: 500 });
    console.log(
      'PASS real picker, independent uploads, stable retry, native menu, copy and byte-preserving download. TextEdit dispatched for external save.',
    );
  } else {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (phase === 'open-editor') {
      await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
      await clickText('.bh-root button', 'Real Attachment Files QA');
      await page.waitForNetworkIdle({ idleTime: 500 });
      await page.click('button.bh-message-file');
      await menuReady();
      fixture.authority = snapshot();
      writeFileSync(fixturePath, JSON.stringify(fixture));
      await clickText('[role="menu"] button', '文本编辑');
      await page.waitForSelector('[role="menu"]', { hidden: true });
      await page.waitForNetworkIdle({ idleTime: 500 });
      console.log('PASS waited for complete native editor handoff; ready for external save.');
    } else if (phase === 'reveal') {
      await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
      await clickText('.bh-root button', 'Real Attachment Files QA');
      await page.waitForNetworkIdle({ idleTime: 500 });
      await page.click('button.bh-message-file');
      await menuReady();
      await clickText('[role="menu"] button', '显示文件位置');
      await page.waitForSelector('[role="menu"]', { hidden: true });
      await page.waitForNetworkIdle({ idleTime: 500 });
      console.log('PASS native reveal dispatched for the same message-owned destination.');
    } else if (phase === 'verify') {
      assert.equal(
        readFileSync(fixture.path, 'utf8'),
        saved,
        'Save through the real TextEdit UI before verify',
      );
      assert.equal(readFileSync(fixture.source, 'utf8'), initial);
      assert.deepEqual(
        snapshot(),
        fixture.authority,
        'External save must not change Source Events, admissions or schedule state',
      );
      const current = (
        await rpc('channelTimeline', { channelId: fixture.channelId })
      ).page.entries.find((e) => e.id === fixture.messageId);
      assert.equal(current.attachments[0].size, Buffer.byteLength(saved));
      assert.equal(current.attachments[0].mime, 'text/plain');
      const originalRead = await bytes(url(fixture));
      assert.equal(originalRead.text, saved);
      assert.equal(originalRead.cache, 'no-store');
      assert.equal(
        (await bytes(url(fixture, fixture.independentMessageId, fixture.independentRef))).text,
        initial,
      );
      const { message: shared } = await rpc('channelSend', {
        channelId: fixture.channelId,
        body: 'Explicitly shared file',
        attachments: [fixture.ref],
      });
      fixture.sharedMessageId = shared.id;
      assert.equal((await bytes(url(fixture, shared.id))).text, saved);
      const { channel: other } = await rpc('channelCreate', {
        name: 'Unrelated Files',
        members: [],
      });
      const refused = await page.evaluate(
        async (a) => {
          const result = await (
            await fetch('/api/botharness/messageAttachmentTarget', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'refusal',
                method: 'botharness/messageAttachmentTarget',
                payload: { args: a },
              }),
            })
          ).json();
          return result.result;
        },
        { channelId: other.id, messageId: fixture.messageId, fileId: fixture.ref.fileId },
      );
      assert.equal(refused.ok, false);
      assert.equal(
        (
          await bytes(
            '/api/botharness/attachment?' +
              new URLSearchParams({
                channelId: other.id,
                messageId: fixture.messageId,
                fileId: fixture.ref.fileId,
              }),
          )
        ).status,
        404,
      );
      const finalAuthority = snapshot();
      await bytes(url(fixture));
      assert.deepEqual(snapshot(), finalAuthority);
      await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
      await clickText('.bh-root button', 'Real Attachment Files QA');
      await page.waitForNetworkIdle({ idleTime: 500 });
      await page.screenshot({ path: join(out, 'saved-current-message.png') });
      writeFileSync(fixturePath, JSON.stringify(fixture));
      console.log(
        'PASS external TextEdit save changed original read/download and explicit shared reference, isolated source and equal independent upload, current metadata, owner refusal, no admission or wake.',
      );
    } else if (phase === 'restart') {
      assert.equal((await bytes(url(fixture))).text, saved);
      assert.equal((await bytes(url(fixture, fixture.sharedMessageId))).text, saved);
      assert.equal(
        (await bytes(url(fixture, fixture.independentMessageId, fixture.independentRef))).text,
        initial,
      );
      const parked = fixture.path + '.qa-missing';
      renameSync(fixture.path, parked);
      try {
        assert.equal((await bytes(url(fixture))).status, 404);
        assert.equal(existsSync(fixture.path), false);
      } finally {
        renameSync(parked, fixture.path);
      }
      assert.equal((await bytes(url(fixture))).text, saved);
      console.log(
        'PASS restart preserved identities/current bytes; missing destination returned unavailable and was never recreated.',
      );
    } else throw new Error('Unknown phase');
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: join(local, phase + '-failure.png') });
  console.log(await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  await browser.close();
}
