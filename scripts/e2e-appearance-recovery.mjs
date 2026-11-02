import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  truncateSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
const modules = resolve('node_modules/.pnpm');
const dependency = (name) =>
  createRequire(
    resolve(
      modules,
      readdirSync(modules).find((x) => x.startsWith(name + '@')),
      'node_modules/',
    ),
  )(name);
const puppeteer = dependency('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), 'recovery-' + Date.now());
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const errors = [];
const consoleEntries = [];
page.on('console', (m) => {
  if (['error', 'warn'].includes(m.type())) consoleEntries.push({ type: m.type(), text: m.text() });
});
page.on('pageerror', (e) => errors.push(e.message));
const pause = () => new Promise((r) => setTimeout(r, 300));
const key = 'botharness:appearance:v1';
const baseline = process.argv.includes('--baseline');
const read = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const cliRaw = async (command, args = [], patch) => {
  const url = new URL(instance.url);
  const child = execFile(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', command, '--host', url.origin, ...args],
    { env: { ...process.env, DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token') } },
  );
  child.stdin.end(patch === undefined ? '' : JSON.stringify(patch));
  return new Promise((resolve, reject) => {
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (v) => (stdout += v));
    child.stderr.on('data', (v) => (stderr += v));
    child.on('exit', (code) => {
      if (code !== 0) return reject(Error(stderr || stdout));
      resolve(JSON.parse(stdout));
    });
  });
};
const cli = async (...args) => {
  for (let i = 0; ; i++) {
    try {
      return await cliRaw(...args);
    } catch (e) {
      if (i >= 15 || !e.message.includes('appearance-client-unavailable')) throw e;
      await pause();
    }
  }
};
const click = (name) => page.locator(`::-p-aria(${name}[role="button"])`).click();
const select = async (name, value) => {
  if (await page.$(`[role="radiogroup"][aria-label="${name}"]`)) {
    await page.locator(`::-p-aria(${value}[role="radio"])`).click();
    await pause();
    return;
  }
  await click(name);
  await page.locator(`::-p-aria(${value}[role="menuitem"])`).click();
  await pause();
};
const screenshot = async (name) => {
  await pause();
  await page.screenshot({ path: resolve(out, name + '.png') });
  writeFileSync(
    resolve(out, name + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};
const findTarget = async () => {
  const revision = (await read()).revision;
  for (let attempt = 0; attempt < 12; attempt++) {
    for (const candidate of (await cli('appearance-clients')).clients) {
      try {
        const value = await cli('appearance-get', ['--client-id', candidate.id]);
        if (value.snapshot.config.revision === revision) return candidate.id;
      } catch {}
    }
    await pause();
  }
  throw Error('No matching live Client after bounded read-only discovery');
};

const videoPath = resolve(out, 'source.webm'),
  imagePath = resolve(out, 'source.png');
const run = (args) => new Promise((r, j) => execFile('ffmpeg', args, (e) => (e ? j(e) : r())));
await run([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=960x600:rate=24',
  '-t',
  '1.5',
  '-an',
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '400k',
  videoPath,
]);
await run(['-y', '-i', videoPath, '-frames:v', '1', imagePath]);
let target;
const settings = async () => {
  await click('Bot settings');
  await click('Appearance');
};
const patch = async (value) => {
  const v = await read();
  await cli(
    'appearance-set',
    ['--client-id', target, '--expected-revision', v.revision, '--patch-stdin'],
    value,
  );
  await pause();
};
const media = async (command, args = [], crop) => {
  const got = (await cli('wallpaper-get', ['--client-id', target])).wallpaper;
  return cli(command, ['--client-id', target, '--expected-revision', got.revision, ...args], crop);
};
const record = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const q = indexedDB.open('botharness-wallpaper-v1');
        q.onerror = reject;
        q.onsuccess = () => {
          const db = q.result;
          const store = db.transaction('assets').objectStore('assets');
          const index = store.get('library');
          index.onsuccess = () => {
            if (!index.result?.active) {
              resolve(null);
              db.close();
              return;
            }
            const r = store.get('item:' + index.result.active);
            r.onsuccess = () => {
              const v = r.result;
              resolve(
                v
                  ? {
                      revision: index.result.revision,
                      kind: v.kind,
                      size: v.blob.size,
                      crop: v.crop,
                      poster: v.poster?.size,
                    }
                  : null,
              );
              db.close();
            };
          };
        };
      }),
  );
const layout = () => page.evaluate(() => localStorage.getItem('botharness.bot-mode-layout'));
const restoredLayout = (actual, expected) => {
  const compare = (a, b, key) => {
    if (typeof a === 'number' && typeof b === 'number') {
      assert.ok(Math.abs(a - b) <= (['size', 'width', 'height'].includes(key) ? 1 : 1e-9));
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
      for (const k of Object.keys(a)) compare(a[k], b[k], k);
      return;
    }
    assert.deepEqual(a, b);
  };
  compare(JSON.parse(actual), JSON.parse(expected), '');
};

const panelPatch = (mode, id) => ({
  mode,
  panel: {
    id,
    materials: {
      header: { color: '#111111', opacity: 2, blur: 25 },
      body: { color: '#551122', opacity: 3, blur: 20 },
    },
  },
});
const seed = async () => {
  await patch({
    preference: 'light',
    mode: 'light',
    preset: 'forest-green',
    primary: '#ffffff',
    materials: { header: { opacity: 4 }, body: { opacity: 5 } },
  });
  await patch({
    mode: 'dark',
    preset: 'mist-purple',
    primary: '#ffbb11',
    materials: { body: { opacity: 6 } },
  });
  for (const mode of ['light', 'dark'])
    for (const id of ['dock:bh:channel-body', 'dock:memory-files', 'dock:memory-details'])
      await patch(panelPatch(mode, id));
};
const defaults = async () => {
  const v = await read();
  assert.equal(v.preference, 'system');
  assert.deepEqual(v.modes, {
    light: { preset: 'classic-blue' },
    dark: { preset: 'classic-blue' },
  });
  assert.equal(await record(), null);
};
const beginReset = async () => {
  await click('Restore defaults…');
  await page.waitForSelector('[data-appearance-reset-confirmation]');
};
const confirm = async () => {
  await click('Restore defaults');
  await page.waitForFunction(() => !document.querySelector('[data-appearance-reset-confirmation]'));
  await pause();
};
try {
  await cli('create', ['--name', 'Recovery Alpha', '--operation-key', 'appearance-recovery-alpha']);
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (b) =>
            [
              'Continue',
              'Configure later',
              'Skip tutorial',
              '继续',
              '稍后配置',
              '跳过教程',
            ].includes(b.textContent.trim()) && b.offsetParent,
        )
        ?.click(),
    );
    await pause();
  }
  if (!(await page.$('.bh-workspace-rail'))) await click('Bot mode');

  const nativeBefore = await page.evaluate(() => ({
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    style: document.body.getAttribute('style'),
  }));
  await settings();
  await select('Theme', 'Light');
  target = await findTarget();
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    [...document.querySelectorAll('.bh-workspace-channels button[data-channel-id]')]
      .find((n) => n.textContent.includes('Recovery Alpha') && n.checkVisibility())
      .click(),
  );
  await pause();
  if (!(await page.$('[data-dock-header="bh:channel-body"]')))
    await page.locator('.bh-workspace-rail button[aria-label^="Messages ·"]').click();
  await page.waitForSelector('[data-dock-header="bh:channel-body"]');
  for (const name of ['Close Home', 'Close Sessions'])
    await page.evaluate(
      (name) =>
        [...document.querySelectorAll('button')]
          .find((n) => n.getAttribute('aria-label') === name && n.checkVisibility())
          ?.click(),
      name,
    );
  await click('Memory files');
  await page.waitForSelector('[data-channel-subpanel="memory-files"]');
  await seed();
  await media('wallpaper-import', ['--file', imagePath]);
  await screenshot(baseline ? 'before-panels' : 'customized-panels');
  await settings();
  if (baseline) {
    await screenshot('before-settings');
  } else {
    const before = await read(),
      image = await record(),
      savedLayout = await layout(),
      bots = await cli('list');
    const oldClients = new Set((await cli('appearance-clients')).clients.map((c) => c.id));
    const independent = await browser.createBrowserContext();
    const otherPage = await independent.newPage();
    await otherPage.goto(instance.url, { waitUntil: 'networkidle2' });
    await otherPage.goto(instance.url, { waitUntil: 'networkidle2' });
    let otherId;
    for (const candidate of (await cli('appearance-clients')).clients.filter(
      (c) => !oldClients.has(c.id),
    )) {
      try {
        const v = await cli('appearance-get', ['--client-id', candidate.id]);
        if (v.snapshot.config.revision === 'initial') {
          otherId = candidate.id;
          break;
        }
      } catch {}
    }
    assert.ok(otherId);
    await cli(
      'appearance-set',
      ['--client-id', otherId, '--expected-revision', 'initial', '--patch-stdin'],
      { preference: 'dark', mode: 'dark', primary: '#123456' },
    );
    const otherBefore = await otherPage.evaluate((k) => localStorage.getItem(k), key);
    assert.ok(otherBefore);
    await page.bringToFront();

    await screenshot('readable-recovery');
    await click('Clear panel settings');
    const cleared = await read();
    assert.equal(cleared.modes.light.panels, undefined);
    assert.deepEqual(cleared.modes.dark, before.modes.dark);
    const { panels: _p, ...globals } = before.modes.light;
    assert.deepEqual(cleared.modes.light, globals);
    assert.deepEqual(await record(), image);
    assert.equal(await layout(), savedLayout);
    await screenshot('cleared-current-mode');
    await patch(panelPatch('light', 'dock:memory-files'));
    await beginReset();
    await screenshot('confirm-scope');
    const cancelBefore = await read();
    await click('Cancel');
    assert.deepEqual(await read(), cancelBefore);
    assert.deepEqual(await record(), image);
    await page.evaluate(() => {
      window.restoreAppearanceSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'botharness:appearance:v1')
          throw new DOMException('QA write failure', 'QuotaExceededError');
        return window.restoreAppearanceSet.call(this, k, v);
      };
    });
    await beginReset();
    await confirm();
    assert.deepEqual(await read(), cancelBefore);
    assert.deepEqual(await record(), image);
    await screenshot('preference-failure');
    await page.evaluate(() => {
      Storage.prototype.setItem = window.restoreAppearanceSet;
      delete window.restoreAppearanceSet;
    });
    await page.evaluate(() => {
      window.restoreMediaDelete = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function (k) {
        if (this.name === 'assets')
          throw new DOMException('QA delete failure', 'QuotaExceededError');
        return window.restoreMediaDelete.call(this, k);
      };
    });
    await beginReset();
    await confirm();
    assert.equal((await read()).preference, 'system');
    assert.deepEqual(await record(), image);
    await page
      .locator('::-p-text(Colors were restored, but wallpapers could not be removed)')
      .wait();
    await screenshot('partial-reset');
    await page.evaluate(() => {
      IDBObjectStore.prototype.delete = window.restoreMediaDelete;
      delete window.restoreMediaDelete;
    });
    await beginReset();
    await confirm();
    await defaults();
    assert.equal(await layout(), savedLayout);
    await screenshot('reset-image-complete');
    await seed();
    await media('wallpaper-import', ['--file', videoPath]);
    await page.waitForSelector('[data-bh-wallpaper] video');
    await click('Adjust crop · Wallpaper 1');
    await page.waitForSelector('[data-wallpaper-preview] video');
    await page.evaluate(() => {
      window.acceptedVideo = document.querySelector('[data-bh-wallpaper] video');
      window.previewVideo = document.querySelector('[data-wallpaper-preview] video');
    });
    await beginReset();
    await confirm();
    await defaults();
    assert.equal(await page.$('[data-wallpaper-preview]'), null);
    assert.deepEqual(
      await page.evaluate(() =>
        [window.acceptedVideo, window.previewVideo].map((v) => ({
          paused: v.paused,
          src: v.getAttribute('src'),
        })),
      ),
      [
        { paused: true, src: null },
        { paused: true, src: null },
      ],
    );
    await screenshot('reset-video-complete');
    await (await page.$('input[aria-label="Add wallpaper"]')).uploadFile(videoPath);
    await page.waitForSelector('[data-wallpaper-item]');
    await click('Adjust crop · Wallpaper 1');
    await page.waitForSelector('[data-wallpaper-preview] video');
    await beginReset();
    await confirm();
    assert.equal(await page.$('[data-wallpaper-preview]'), null);
    await defaults();
    await seed();
    await media('wallpaper-import', ['--file', imagePath]);
    const cliBefore = await read();
    await cli('appearance-clear-panels', [
      '--client-id',
      target,
      '--expected-revision',
      cliBefore.revision,
      '--mode',
      'dark',
    ]);
    assert.equal((await read()).modes.dark.panels, undefined);
    assert.deepEqual((await read()).modes.light, cliBefore.modes.light);
    const p = await read(),
      w = await record();
    await assert.rejects(
      () =>
        cli('appearance-reset', [
          '--client-id',
          target,
          '--expected-revision',
          p.revision,
          '--expected-wallpaper-revision',
          w.revision,
        ]),
      /confirm-reset/,
    );
    assert.deepEqual(await read(), p);
    assert.deepEqual(await record(), w);
    await assert.rejects(
      () =>
        cli('appearance-reset', [
          '--client-id',
          'unknown',
          '--expected-revision',
          p.revision,
          '--expected-wallpaper-revision',
          w.revision,
          '--confirm-reset',
        ]),
      /appearance-client-stale/,
    );
    const result = await cli('appearance-reset', [
      '--client-id',
      target,
      '--expected-revision',
      p.revision,
      '--expected-wallpaper-revision',
      w.revision,
      '--confirm-reset',
    ]);
    assert.equal(result.complete, true);
    await defaults();
    const expected = await read();
    await page.keyboard.press('Escape');
    await screenshot('default-panels');
    await page.reload({ waitUntil: 'networkidle2' });
    target = await findTarget();
    assert.deepEqual(await read(), expected);
    await defaults();
    restoredLayout(await layout(), savedLayout);
    await screenshot('defaults-restored');
    assert.equal(await otherPage.evaluate((k) => localStorage.getItem(k), key), otherBefore);
    await independent.close();
    assert.deepEqual(await cli('list'), bots);
    assert.deepEqual(
      await page.evaluate(() => ({
        dark: document.body.hasAttribute('data-ds-dark-theme'),
        style: document.body.getAttribute('style'),
      })),
      nativeBefore,
    );
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.getAttribute('aria-label') === 'Exit Bot mode')
        .click(),
    );
    await pause();
    assert.equal(await page.$('[data-bh-wallpaper]'), null);
    await click('Bot mode');
    await defaults();
    assert.deepEqual(errors, []);
    writeFileSync(
      resolve(out, 'proof.json'),
      JSON.stringify(
        {
          independentClientUnchanged: true,
          modeClearScope: true,
          confirmationCancel: true,
          preferenceFailurePreserves: true,
          partialMediaFailureAndRetry: true,
          imageReset: true,
          videoAndPreviewCleanup: true,
          uncommittedPreviewCleanup: true,
          cliConfirmationAndTarget: true,
          layoutUnchanged: true,
          botsUnchanged: true,
          dshUnchanged: true,
          reloadAndReentry: true,
          errors,
        },
        null,
        2,
      ),
    );
  }
  console.log(JSON.stringify({ ok: true, out, baseline }));
} catch (e) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(
    resolve(out, 'failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  writeFileSync(resolve(out, 'errors.json'), JSON.stringify(errors));
  throw e;
} finally {
  writeFileSync(resolve(out, 'console.json'), JSON.stringify(consoleEntries, null, 2));
  await browser.close();
}
