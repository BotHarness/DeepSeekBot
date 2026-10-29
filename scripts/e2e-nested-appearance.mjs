import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { cookieFor } from './verify-app.mjs';
import { execFileSync, execFile } from 'node:child_process';
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
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), 'nested-' + Date.now());
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = () => new Promise((r) => setTimeout(r, 300));
const key = 'botharness:appearance:v1';
const read = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const cli = async (command, args = [], patch) => {
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
  for (const candidate of (await cli('appearance-clients')).clients) {
    try {
      const value = await cli('appearance-get', ['--client-id', candidate.id]);
      if (value.snapshot.config.revision === revision) return candidate.id;
    } catch {}
  }
  throw Error('No Client matches the browser configuration revision');
};
const clickBot = async (name) => {
  await page.evaluate((name) => {
    const matches = [
      ...document.querySelectorAll('.bh-workspace-channels button[data-channel-id]'),
    ].filter((n) => n.textContent.includes(name) && n.checkVisibility());
    assertSingle(matches);
    function assertSingle(nodes) {
      if (nodes.length !== 1) throw Error('Expected one visible channel row for ' + name);
    }
    matches[0].click();
  }, name);
  await pause();
};
const fixtureServer = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(
    '<!doctype html><title>Appearance pixel fixture</title><body style="margin:0;background:#3467a2;color:white;font:32px sans-serif"><h1>Appearance pixel fixture</h1><div style="width:240px;height:200px;background:#ed4235">Unchanged pixels</div></body>',
  );
});
await new Promise((r) => fixtureServer.listen(0, '127.0.0.1', r));
let target;
const patch = async (value) => {
  const current = await read();
  await cli(
    'appearance-set',
    ['--client-id', target, '--expected-revision', current.revision, '--patch-stdin'],
    value,
  );
  await pause();
};
try {
  const created = await cli('create', [
    '--name',
    'Panel Alpha',
    '--operation-key',
    'appearance-panel-alpha',
  ]);
  const rpc = async (method, args) => {
    const u = new URL(instance.url);
    const res = await fetch(u.origin + '/api/botharness/' + method, {
      method: 'POST',
      headers: { cookie: cookieFor(instance.home), 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'nested-' + Date.now(),
        method: 'botharness/' + method,
        payload: { args },
      }),
    });
    const body = await res.json();
    assert.equal(body.result.ok, true);
    return body.result.value;
  };
  const bot = await rpc('get', { slug: created.bot.id });
  const memory = bot.bot.memoryDir;
  const git = (...args) =>
    execFileSync('git', ['-C', memory, ...args], { encoding: 'utf8' }).trim();
  writeFileSync(
    resolve(memory, 'appearance-note.md'),
    '# Appearance note\nFirst committed version.\n',
  );
  git('add', 'appearance-note.md');
  git(
    '-c',
    'user.name=Appearance QA',
    '-c',
    'user.email=qa@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Appearance verification fixture',
  );
  writeFileSync(
    resolve(memory, 'appearance-note.md'),
    '# Appearance note\nUpdated working tree.\n',
  );
  await cli('create', ['--name', 'Panel Beta', '--operation-key', 'appearance-panel-beta']);
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
  const native = await page.evaluate(() => ({
    mode: document.body.hasAttribute('data-ds-dark-theme'),
    style: document.body.getAttribute('style'),
  }));
  await click('Bot settings');
  await click('Appearance');
  await select('Theme', 'Light');
  target = await findTarget();
  await page.keyboard.press('Escape');
  await pause();
  await clickBot('Panel Alpha');
  if (!(await page.$('[data-dock-header="bh:channel-body"]')))
    await page.locator('.bh-workspace-rail button[aria-label^="Messages ·"]').click();
  await page.waitForSelector('[data-dock-header="bh:channel-body"]');
  const header = (id) => page.locator(`[data-dock-header="${id}"]`);
  const openPanel = async (id) => {
    await header(id).click({ button: 'right' });
    await pause();
    await page.locator('::-p-aria(Appearance settings[role="menuitem"])').click();
    await page.waitForSelector('[data-panel-appearance]');
  };
  const visibleClick = async (name) => {
    await page.evaluate((name) => {
      const n = [...document.querySelectorAll('button')].find(
        (n) => n.getAttribute('aria-label') === name && n.checkVisibility(),
      );
      if (!n) throw Error('Visible button missing: ' + name);
      n.click();
    }, name);
    await pause();
  };
  for (const name of ['Close Home', 'Close Sessions']) {
    if (
      await page.evaluate(
        (name) =>
          [...document.querySelectorAll('button')].some(
            (n) => n.getAttribute('aria-label') === name && n.checkVisibility(),
          ),
        name,
      )
    )
      await visibleClick(name);
  }
  await visibleClick('Memory files');
  await page.waitForSelector('[data-channel-subpanel="memory-files"]');
  await patch({
    mode: 'light',
    panel: {
      id: 'dock:bh:channel-body',
      materials: { header: { color: '#9fd8a8' }, body: { color: '#a9dcb1', opacity: 100 } },
    },
  });
  if (process.argv.includes('--baseline')) {
    await page
      .locator('[data-channel-subpanel="memory-files"] [data-dock-header]')
      .click({ button: 'right' });
    await screenshot('before-nested-menu');
    await page.keyboard.press('Escape');
    await screenshot('before-parent-child');
    await page.locator('::-p-aria(appearance-note.md[role="treeitem"])').click();
    await page.waitForSelector('.bh-memory-commit-view');
    await screenshot('before-memory-file');
    await visibleClick('Back to chat');
    await visibleClick('Memory evolution');
    await page.waitForSelector('.bh-memory-graph-row');
    await page.locator('.bh-memory-graph-row').click();
    await page.waitForSelector('.bh-memory-commit-view');
    await screenshot('before-memory-commit');
    await visibleClick('Back to chat');
    await page.locator('::-p-aria(E appearance-note.md[role="button"])').click();
    await page.waitForSelector('.bh-memory-commit-view');
    await screenshot('before-memory-working');
    await visibleClick('Back to chat');
    await visibleClick('Close Memory files');
    await visibleClick('Close Memory evolution');
    await visibleClick('Browser');
    await visibleClick('Computer');
    await screenshot('before-browser-computer');
  } else {
    const surface = async (id, part) =>
      page.$eval(`[data-appearance-${part}="${id}"]`, (n) => {
        const s = getComputedStyle(n);
        return { background: s.backgroundColor, blur: s.backdropFilter, opacity: s.opacity };
      });
    const global = await surface('memory-files', 'body');
    assert.equal(global.background, 'color(srgb 0.992157 0.996078 0.996078)');
    await screenshot('parent-green-child-global');
    await openPanel('memory-files');
    assert.equal(await page.$$eval('[data-pointer-menu]', (n) => n.length), 0);
    assert.equal(
      await page.$eval('[data-panel-appearance]', (n) => n.dataset.panelAppearance),
      'dock:memory-files',
    );
    await page.locator('input[aria-label="Body opacity"]').fill('64');
    await page.keyboard.press('Enter');
    await pause();
    await patch({
      mode: 'light',
      panel: {
        id: 'dock:memory-files',
        materials: { header: { color: '#f2d2a8', blur: 4 }, body: { color: '#f8e1bc', blur: 7 } },
      },
    });
    await screenshot('child-modal');
    await page.keyboard.press('Escape');
    await pause();
    assert.equal((await read()).modes.light.panels['dock:memory-files'].body.opacity, 64);
    assert.equal((await surface('memory-files', 'body')).opacity, '1');
    await page.locator('::-p-aria(appearance-note.md[role="treeitem"])').click();
    await page.waitForSelector('.bh-memory-commit-view');
    await page.locator('[data-appearance-header="memory-details"]').click({ button: 'right' });
    await page.locator('::-p-aria(Appearance settings[role="menuitem"])').click();
    assert.equal(
      await page.$eval('[data-panel-appearance]', (n) => n.dataset.panelAppearance),
      'dock:memory-details',
    );
    await patch({
      mode: 'light',
      panel: {
        id: 'dock:memory-details',
        materials: { header: { color: '#d3c8f0' }, body: { color: '#e9e0f7', opacity: 85 } },
      },
    });
    await screenshot('memory-details-modal');
    await page.keyboard.press('Escape');
    await pause();
    await screenshot('memory-file');
    const details = await surface('memory-details', 'body');
    await visibleClick('Back to chat');
    await visibleClick('Memory evolution');
    await page.waitForSelector('[data-channel-subpanel="memory-evolution"]');
    writeFileSync(
      resolve(out, 'memory-evolution.aria.json'),
      JSON.stringify(await page.accessibility.snapshot(), null, 2),
    );
    await page.locator('[data-channel-subpanel="memory-evolution"] .bh-memory-graph-row').click();
    await page.waitForSelector('.bh-memory-commit-view');
    assert.deepEqual(await surface('memory-details', 'body'), details);
    await screenshot('memory-commit');
    await visibleClick('Back to chat');
    await page.locator('::-p-aria(E appearance-note.md[role="button"])').click();
    await page.waitForSelector('.bh-memory-commit-view');
    assert.deepEqual(await surface('memory-details', 'body'), details);
    await screenshot('memory-working');
    await visibleClick('Back to chat');
    await visibleClick('Close Memory evolution');
    await visibleClick('Close Memory files');
    await visibleClick('Independent appearance sample');
    await page.waitForSelector('[data-independent-sample]');
    await openPanel('appearance-qa:sample');
    await patch({
      mode: 'light',
      panel: {
        id: 'dock:appearance-qa:sample',
        materials: {
          header: { color: '#b8dce6' },
          body: { color: '#c5dfe8', opacity: 55, blur: 5 },
        },
      },
    });
    await screenshot('independent-modal');
    await page.keyboard.press('Escape');
    await pause();
    await page.locator('input[aria-label="Independent draft"]').fill('Appearance keeps this draft');
    const pixel = await page.$eval('[data-independent-pixel]', (n) => ({
      background: getComputedStyle(n).backgroundColor,
      opacity: getComputedStyle(n).opacity,
    }));
    assert.deepEqual(pixel, { background: 'rgb(237, 66, 53)', opacity: '1' });
    await patch({
      mode: 'light',
      panel: { id: 'dock:appearance-qa:sample', materials: { body: { opacity: 30 } } },
    });
    assert.equal(
      await page.$eval('input[aria-label="Independent draft"]', (n) => n.value),
      'Appearance keeps this draft',
    );
    await screenshot('independent-content');
    await visibleClick('Independent appearance control');
    await click('Unregister sample');
    await pause();
    const absent = await cli('appearance-targets', ['--client-id', target]);
    assert.equal(
      absent.targets.some((x) => x.id === 'dock:appearance-qa:sample'),
      false,
    );
    const retained = (await read()).modes.light.panels['dock:appearance-qa:sample'];
    await assert.rejects(
      () => patch({ mode: 'light', panel: { id: 'dock:appearance-qa:sample', reset: true } }),
      /appearance-target-unavailable/,
    );
    await click('Register sample');
    await page.waitForSelector('[data-independent-sample]');
    assert.deepEqual((await read()).modes.light.panels['dock:appearance-qa:sample'], retained);
    await screenshot('independent-reregistered');
    await visibleClick('Close Independent appearance control');
    await visibleClick('Close Independent appearance sample');
    await visibleClick('Browser');
    await openPanel('botharness-browser');
    await patch({
      mode: 'light',
      panel: {
        id: 'dock:botharness-browser',
        materials: {
          header: { color: '#c9d4f2' },
          body: { color: '#e3e7f7', opacity: 60, blur: 5 },
        },
      },
    });
    await screenshot('browser-modal');
    await page.keyboard.press('Escape');
    await pause();
    if (await page.$('button[aria-label="Enable Browser Access"]'))
      await visibleClick('Enable Browser Access');
    await page.waitForSelector('button[aria-label="Disable Browser Access"]');
    await cli('browser-tool', [created.bot.id, 'browser_open', '--args-stdin'], {
      url: 'http://127.0.0.1:' + fixtureServer.address().port + '/',
    });
    await page.waitForSelector('.bh-browser-body iframe', { timeout: 60000 });
    const browserFrame = await page.$('.bh-browser-body iframe');
    const viewer = await browserFrame.contentFrame();
    await viewer.waitForSelector('canvas, img', { timeout: 30000 });
    await pause();
    const media = await viewer.evaluate(() =>
      [...document.querySelectorAll('canvas,img')].map((n) => ({
        tag: n.tagName,
        width: n.width,
        height: n.height,
        opacity: getComputedStyle(n).opacity,
        filter: getComputedStyle(n).filter,
      })),
    );
    assert.ok(media.length);
    assert.ok(media.every((n) => n.opacity === '1' && n.filter === 'none'));
    await screenshot('browser-live');
    const samplePixels = (buffer) => {
      const png = dependency('pngjs').PNG.sync.read(buffer);
      const x = Math.floor(png.width * 0.8),
        y = Math.floor(png.height * 0.45);
      return [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
    };
    const beforePixels = samplePixels(await browserFrame.screenshot());
    await patch({
      mode: 'light',
      panel: { id: 'dock:botharness-browser', materials: { body: { opacity: 25 } } },
    });
    const afterMedia = await viewer.evaluate(() =>
      [...document.querySelectorAll('canvas,img')].map((n) => ({
        tag: n.tagName,
        width: n.width,
        height: n.height,
        opacity: getComputedStyle(n).opacity,
        filter: getComputedStyle(n).filter,
      })),
    );
    assert.deepEqual(afterMedia, media);
    const afterPixels = samplePixels(await browserFrame.screenshot());
    assert.deepEqual(afterPixels, beforePixels);
    writeFileSync(
      resolve(out, 'browser-pixels.json'),
      JSON.stringify({ media, afterMedia, beforePixels, afterPixels }, null, 2),
    );
    await screenshot('browser-live-translucent');
    await cli('browser-stop', [created.bot.id]);

    await visibleClick('Computer');
    await openPanel('botharness-computer');
    await patch({
      mode: 'light',
      panel: {
        id: 'dock:botharness-computer',
        materials: {
          header: { color: '#edc9bf' },
          body: { color: '#f5e0d8', opacity: 75, blur: 4 },
        },
      },
    });
    await screenshot('computer-modal');
    await page.keyboard.press('Escape');
    await pause();
    await screenshot('browser-computer');
    if (await page.$('button[aria-label="Enable Computer Access"]'))
      await visibleClick('Enable Computer Access');
    await page.waitForSelector('button[aria-label="Disable Computer Access"]');
    const computerStatus = await cli('computer-status');
    assert.equal(computerStatus.target, 'local');
    assert.equal(await page.$('[data-channel-subpanel="botharness-computer"] iframe'), null);
    await screenshot('computer-local-permissions');
    writeFileSync(resolve(out, 'computer-status.json'), JSON.stringify(computerStatus, null, 2));

    const saved = (await read()).modes.light.panels;
    await patch({ mode: 'light', panel: { id: 'dock:bh:channel-body', reset: true } });
    assert.deepEqual(
      (await read()).modes.light.panels['dock:memory-files'],
      saved['dock:memory-files'],
    );
    await clickBot('Panel Beta');
    await clickBot('Panel Alpha');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-channel-subpanel="botharness-computer"]');
    await pause();
    assert.deepEqual(
      (await read()).modes.light.panels['dock:memory-details'],
      saved['dock:memory-details'],
    );
    await screenshot('restored-nested');
    const targets = await cli('appearance-targets', ['--client-id', await findTarget()]);
    writeFileSync(
      resolve(out, 'results.json'),
      JSON.stringify({ global, details, saved, targets, errors }, null, 2),
    );
    assert.deepEqual(errors, []);
  }
  console.log(JSON.stringify({ ok: true, evidence: out }));
} catch (e) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(
    resolve(out, 'failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  console.error(out);
  throw e;
} finally {
  fixtureServer.close();
  await browser.close();
}
