import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
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
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), 'panels-' + Date.now());
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
  await cli('create', ['--name', 'Panel Alpha', '--operation-key', 'appearance-panel-alpha']);
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
  if (process.argv.includes('--baseline')) {
    await header('bh:channel-body').click({ button: 'right' });
    await screenshot('before-header-menu');
    await page.keyboard.press('Escape');
    await pause();
    await screenshot('before-panels');
  } else {
    const targets = await cli('appearance-targets', ['--client-id', target]);
    assert.ok(targets.targets.some((t) => t.id === 'dock:bh:channel-body'));
    assert.ok(targets.targets.some((t) => t.id === 'dock:activity-center'));
    await header('bh:channel-body').click({ button: 'right' });
    await screenshot('after-header-menu');
    await page.locator('::-p-aria(Appearance settings[role="menuitem"])').click();
    await page.waitForSelector('[data-panel-appearance="dock:bh:channel-body"]');
    const input = page.locator('input[aria-label="Header opacity"]');
    await input.fill('42');
    await page.keyboard.press('Enter');
    await pause();
    assert.equal((await read()).modes.light.panels['dock:bh:channel-body'].header.opacity, 42);
    await patch({
      mode: 'light',
      panel: {
        id: 'dock:bh:channel-body',
        materials: {
          header: { color: '#e0c1ed', blur: 9 },
          body: { color: '#d5e9f1', opacity: 70, blur: 8 },
        },
      },
    });
    await page.locator('[data-panel-appearance]').click({ button: 'right' });
    assert.equal(await page.$('[data-pointer-menu]'), null);
    await screenshot('after-messages-modal');
    await page.keyboard.press('Escape');
    await pause();
    if (!(await page.$('[data-dock-header="activity-center"]')))
      await page.locator('.bh-workspace-rail [data-pinned-panel="activity-center"]').click();
    await page.waitForSelector('[data-dock-header="activity-center"]');
    await patch({
      mode: 'light',
      panel: {
        id: 'dock:activity-center',
        materials: {
          header: { color: '#e7d7b2' },
          body: { color: '#f4dfb5', opacity: 82, blur: 4 },
        },
      },
    });
    await screenshot('after-two-panels');
    const styles = await page.evaluate(() => {
      const result = {};
      for (const id of ['bh:channel-body', 'activity-center']) {
        const group = document.querySelector(
          `.dv-groupview:has(> .dv-tabs-and-actions-container .dv-active-tab [data-dock-header="${id}"])`,
        );
        if (!group) throw Error('Functional group missing: ' + id);
        result[id] = ['.dv-tabs-and-actions-container', '.dv-content-container'].map((selector) => {
          const s = getComputedStyle(group.querySelector(':scope > ' + selector));
          return { background: s.backgroundColor, blur: s.backdropFilter, opacity: s.opacity };
        });
      }
      return result;
    });
    assert.equal(styles['bh:channel-body'][0].blur, 'blur(9px)');
    assert.equal(styles['bh:channel-body'][1].blur, 'blur(8px)');
    assert.equal(styles['activity-center'][1].blur, 'blur(4px)');
    assert.ok(
      Object.values(styles)
        .flat()
        .every((s) => s.opacity === '1'),
    );
    await openPanel('bh:channel-body');
    await click('Follow global: Header opacity');
    await pause();
    assert.equal(
      (await read()).modes.light.panels['dock:bh:channel-body'].header.opacity,
      undefined,
    );
    await screenshot('after-follow-global');
    await page.keyboard.press('Escape');
    await pause();
    const ownBeforePreset = structuredClone((await read()).modes.light.panels);
    await patch({ mode: 'light', materials: { header: { opacity: 66 } } });
    const inherited = await page.$eval(
      '.dv-groupview:has(.dv-active-tab [data-dock-header="bh:channel-body"]) > .dv-tabs-and-actions-container',
      (n) => getComputedStyle(n).backgroundColor,
    );
    assert.ok(inherited.includes('0.66'), inherited);
    await patch({ mode: 'light', preset: 'forest-green' });
    assert.deepEqual((await read()).modes.light.panels, ownBeforePreset);
    const light = (await read()).modes.light;
    await clickBot('Panel Beta');
    await pause();
    assert.deepEqual((await read()).modes.light, light);
    await clickBot('Panel Alpha');
    await pause();
    assert.deepEqual((await read()).modes.light, light);
    await patch({ preference: 'dark' });
    await patch({
      mode: 'dark',
      panel: { id: 'dock:bh:channel-body', materials: { body: { color: '#283d4b', opacity: 90 } } },
    });
    await screenshot('after-dark-panels');
    assert.deepEqual((await read()).modes.light, light);
    await patch({ preference: 'light' });
    await header('bh:channel-body').click({ button: 'right' });
    await page.locator('::-p-aria(Close Messages[role="menuitem"])').click();
    await pause();
    assert.equal(await page.$('[data-dock-header="bh:channel-body"]'), null);
    await clickBot('Panel Alpha');
    if (!(await page.$('[data-dock-header="bh:channel-body"]')))
      await page.locator('.bh-workspace-rail button[aria-label^="Messages ·"]').click();
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    assert.deepEqual((await read()).modes.light, light);
    const saved = await read();
    await page.reload({ waitUntil: 'networkidle2' });
    if (!(await page.$('[data-dock-header="bh:channel-body"]')))
      await page.locator('.bh-workspace-rail button[aria-label^="Messages ·"]').click();
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    assert.deepEqual(await read(), saved);
    target = await findTarget();
    await screenshot('after-reload');
    await openPanel('bh:channel-body');
    await click('Reset this panel');
    await pause();
    const reset = await read();
    assert.equal(reset.modes.light.panels['dock:bh:channel-body'], undefined);
    assert.deepEqual(
      reset.modes.light.panels['dock:activity-center'],
      saved.modes.light.panels['dock:activity-center'],
    );
    assert.deepEqual(reset.modes.dark, saved.modes.dark);
    await screenshot('after-reset-panel');
    assert.deepEqual(
      await page.evaluate(() => ({
        mode: document.body.hasAttribute('data-ds-dark-theme'),
        style: document.body.getAttribute('style'),
      })),
      native,
    );
    assert.deepEqual(errors, []);
    writeFileSync(
      resolve(out, 'results.json'),
      JSON.stringify({ styles, targets: targets.targets, saved, reset, native, errors }, null, 2),
    );
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
  await browser.close();
}
