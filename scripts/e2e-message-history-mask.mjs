import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
const modules = resolve('node_modules/.pnpm');
const dep = (n) =>
  createRequire(
    resolve(
      modules,
      readdirSync(modules).find((x) => x.startsWith(n + '@')),
      'node_modules/',
    ),
  )(n);
const pp = dep('puppeteer'),
  { PNG } = dep('pngjs');
const native = process.argv.includes('--native'),
  baseline = process.argv.includes('--baseline');
assert.ok(process.env.BH_E2E_INSTANCE);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
if (native) {
  instance.url = [
    ...readFileSync(process.env.BH_NATIVE_HOST_LOG, 'utf8').matchAll(/dsh web: (http[^\s]+)/g),
  ].at(-1)[1];
}
const out = resolve(
  dirname(process.env.BH_E2E_INSTANCE),
  `mask-${native ? 'native' : 'web'}-${baseline ? 'before' : 'after'}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const browser = native
  ? await pp.connect({ browserURL: process.env.BH_NATIVE_BROWSER_URL, defaultViewport: null })
  : await pp.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = native
  ? (await browser.pages()).find((p) => p.url().startsWith('dsh-app://app/'))
  : await browser.newPage();
const errors = [],
  consoleEntries = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (['warn', 'error'].includes(m.type())) consoleEntries.push({ type: m.type(), text: m.text() });
});
const pause = () => new Promise((r) => setTimeout(r, 250));
const cliRaw = async (command, args = [], input) => {
  writeFileSync(resolve(out, 'stage.txt'), command);
  const u = new URL(instance.url);
  const child = execFile(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', command, '--host', u.origin, ...args],
    { env: { ...process.env, DEEPSEEKBOT_HOST_TOKEN: u.searchParams.get('token') } },
  );
  child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  return new Promise((r, j) => {
    let s = '',
      e = '';
    child.stdout.on('data', (x) => (s += x));
    child.stderr.on('data', (x) => (e += x));
    child.on('exit', (c) => (c ? j(Error(e || s)) : r(JSON.parse(s))));
  });
};
const cli = async (...args) => {
  for (let n = 0; ; n++) {
    try {
      return await cliRaw(...args);
    } catch (e) {
      if (n >= 15 || !e.message.includes('appearance-client-unavailable')) throw e;
      await pause();
    }
  }
};
const rpc = async (method, args = {}) => {
  const endpoint = 'botharness/' + method;
  const result = await page.evaluate(
    async ({ endpoint, args }) => {
      const r = await fetch('./api/' + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'mask-' + crypto.randomUUID(),
          method: endpoint,
          payload: { args },
        }),
      });
      return (await r.json()).result;
    },
    { endpoint, args },
  );
  assert.equal(result?.ok, true, method + ': ' + JSON.stringify(result?.error));
  return result.value;
};
const click = async (name) => {
  await page.evaluate((name) => {
    const b = [...document.querySelectorAll('button')].filter(
      (b) =>
        (b.getAttribute('aria-label') === name || b.textContent.trim() === name) &&
        b.checkVisibility(),
    );
    if (b.length !== 1) throw Error('Expected one visible ' + name + ', got ' + b.length);
    b[0].click();
  }, name);
  await pause();
};
const shot = async (name) => {
  await page.screenshot({ path: resolve(out, name + '.png') });
  writeFileSync(
    resolve(out, name + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};
let target;
page.on('response', async (r) => {
  try {
    if (
      r.url().includes('/api/botharness/appearance-control') &&
      JSON.parse(r.request().postData() ?? '{}').action === 'register'
    ) {
      const x = await r.json();
      target = x.clientId;
    }
  } catch {}
});
const read = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('botharness:appearance:v1')));
const patch = async (v) => {
  await cli(
    'appearance-set',
    ['--client-id', target, '--expected-revision', (await read()).revision, '--patch-stdin'],
    v,
  );
  await pause();
};
try {
  if (!native) {
    await page.setViewport({ width: 1440, height: 1000 });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent: await browser.userAgent(),
      acceptLanguage: 'en-US,en',
    });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  }
  if (native) await page.reload({ waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
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
              '知道了',
              'Got it',
            ].includes(b.textContent.trim()) && b.checkVisibility(),
        )
        ?.click(),
    );
    await pause();
  }
  if (!(await page.$('.bh-workspace-rail'))) await click(native ? 'Bot 模式' : 'Bot mode');
  await click(native ? 'Bot 设置' : 'Bot settings');
  await click(native ? '界面设置' : 'Appearance');
  if (!native) {
    await page.locator(`::-p-aria(${native ? '主题' : 'Theme'}[role="button"])`).click();
    await page.locator(`::-p-aria(${native ? '浅色' : 'Light'}[role="menuitem"])`).click();
  }
  await pause();
  for (let n = 0; !target && n < 20; n++) await pause();
  assert.ok(target);
  await page.keyboard.press('Escape');
  writeFileSync(resolve(out, 'stage.txt'), 'create-history');
  const group = (
    await rpc('channelCreate', {
      name: 'Mask QA history',
      members: [],
      operationKey: 't7-mask-history',
    })
  ).channel;
  assert.ok(group?.id);
  let entries = (await rpc('channelTimeline', { channelId: group.id })).page?.entries ?? [];
  if (!entries.length) {
    for (let n = 0; n < 32; n++)
      await rpc('channelSend', {
        channelId: group.id,
        body: `Mask QA ${String(n + 1).padStart(2, '0')} — Scroll through the real persisted history.\nThese message edges should fade into the chosen Panel background and wallpaper.\nHeader, composer and floating controls remain readable.`,
        messageId: 'human-' + crypto.randomUUID(),
      });
  }
  await page.waitForFunction(
    (id) =>
      [...document.querySelectorAll('.bh-workspace-channels button[data-channel-id]')].some(
        (n) => n.dataset.channelId === id,
      ),
    {},
    group.id,
  );
  await page.evaluate(
    (id) =>
      document.querySelector('.bh-workspace-channels button[data-channel-id="' + id + '"]').click(),
    group.id,
  );
  await pause();
  if (!(await page.$('[data-dock-header="bh:channel-body"]')))
    await page.evaluate(() =>
      [...document.querySelectorAll('.bh-workspace-rail button')]
        .find((b) => /^(Messages|消息) ·/.test(b.getAttribute('aria-label') ?? ''))
        .click(),
    );
  await page.waitForSelector('.bh-chat-body [data-message-id]');
  for (const label of ['Close Sessions', '关闭 会话'])
    await page.evaluate(
      (label) =>
        [...document.querySelectorAll('button')]
          .find((b) => b.getAttribute('aria-label') === label && b.checkVisibility())
          ?.click(),
      label,
    );
  await patch({ preference: 'light' });
  await patch({
    mode: 'light',
    panel: {
      id: 'dock:bh:channel-body',
      materials: {
        header: { color: '#99d2a1', opacity: 100, blur: 0 },
        body: { color: '#99d2a1', opacity: 100, blur: 0 },
      },
    },
  });
  const dimensions = await page.$eval('.bh-chat-body', (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.$eval('.bh-chat-body', (n) => (n.scrollTop = n.scrollHeight / 2));
  await pause();
  await shot('green-history');
  const measures = await page.evaluate(() => {
    const b = document.querySelector('.bh-chat-body'),
      p = document.querySelector('.bh-chat-pane'),
      s = getComputedStyle(b);
    return {
      mask: s.maskImage,
      mode: s.maskMode,
      bodyBg: s.backgroundColor,
      composerMask: getComputedStyle(document.querySelector('.bh-composer-shell')).maskImage,
      oldTop: !!document.querySelector('.bh-chat-top-fade'),
      pseudo: getComputedStyle(
        document.querySelector('.bh-composer-activity-status') ??
          document.querySelector('.bh-composer-shell'),
        '::before',
      ).content,
      layout: localStorage.getItem('botharness.bot-mode-layout'),
      count: b.querySelectorAll('[data-message-id]').length,
    };
  });
  if (!baseline) {
    assert.ok(measures.mask.includes('linear-gradient'));
    assert.equal(measures.mode, 'alpha');
    assert.equal(measures.oldTop, false);
    assert.equal(measures.composerMask, 'none');
    const masked = PNG.sync.read(await page.screenshot());
    await page.$eval('.bh-chat-body', (n) => (n.style.maskImage = 'none'));
    const plain = PNG.sync.read(await page.screenshot());
    await page.$eval('.bh-chat-body', (n) => n.style.removeProperty('mask-image'));
    const scale = masked.width / (await page.evaluate(() => innerWidth));
    let edgeChanges = 0,
      middleChanges = 0;
    for (
      let y = Math.ceil(dimensions.y * scale);
      y < Math.floor((dimensions.y + dimensions.height) * scale);
      y++
    )
      for (
        let x = Math.ceil((dimensions.x + 20) * scale);
        x < Math.floor((dimensions.x + dimensions.width - 20) * scale);
        x++
      ) {
        const i = (y * masked.width + x) * 4;
        const changed = [0, 1, 2].some((c) => Math.abs(masked.data[i + c] - plain.data[i + c]) > 3);
        if (changed) {
          const relative = y / scale - dimensions.y;
          if (relative < 25 || relative > dimensions.height - 9) edgeChanges++;
          else if (relative > dimensions.height * 0.4 && relative < dimensions.height * 0.6)
            middleChanges++;
        }
      }
    assert.ok(edgeChanges > 20, 'actual history alpha changes at edges');
    assert.equal(middleChanges, 0, 'history center is unchanged');
    measures.edgeChanges = edgeChanges;
    measures.middleChanges = middleChanges;
    for (const position of ['top', 'bottom']) {
      await page.$eval(
        '.bh-chat-body',
        (n, pos) => (n.scrollTop = pos === 'top' ? 0 : n.scrollHeight),
        position,
      );
      await pause();
      await shot('green-' + position);
    }
    await page.locator('.bh-composer-input').click();
    await page.keyboard.sendCharacter('Mask QA composer remains interactive');
    assert.ok(
      await page.$eval('.bh-composer-input', (n) => n.textContent.includes('Mask QA composer')),
    );
    const file = resolve(out, 'wallpaper-fixture.png');
    const fixture = new PNG({ width: 1440, height: 1000 });
    const bars = [
      [210, 110, 70],
      [70, 150, 210],
      [170, 90, 180],
    ];
    for (let y = 0; y < fixture.height; y++)
      for (let x = 0; x < fixture.width; x++) {
        const i = (y * fixture.width + x) * 4,
          c = bars[Math.floor(x / 160) % bars.length];
        fixture.data.set([...c, 255], i);
      }
    writeFileSync(file, PNG.sync.write(fixture));
    const w = (await cli('wallpaper-get', ['--client-id', target])).wallpaper;
    await cli('wallpaper-import', [
      '--client-id',
      target,
      '--expected-revision',
      w.revision,
      '--file',
      file,
    ]);
    await patch({
      mode: 'light',
      panel: { id: 'dock:bh:channel-body', materials: { body: { opacity: 0, blur: 0 } } },
    });
    await page.$eval('.bh-chat-body', (n) => (n.scrollTop = n.scrollHeight / 2));
    await pause();
    await shot('wallpaper-history');
    assert.equal(
      await page.$eval('.bh-chat-body', (n) => getComputedStyle(n).backgroundColor),
      'rgba(0, 0, 0, 0)',
    );
    await patch({ preference: 'dark' });
    await patch({
      mode: 'dark',
      panel: {
        id: 'dock:bh:channel-body',
        materials: { body: { color: '#243d2b', opacity: 100, blur: 0 } },
      },
    });
    await shot('dark-history');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bh-chat-body [data-message-id]');
    assert.equal(await page.$eval('.bh-chat-body', (n) => getComputedStyle(n).maskMode), 'alpha');
    measures.reload = true;
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(out, 'proof.json'),
    JSON.stringify({ ...measures, dimensions, baseline, native, errors }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, out }));
} catch (e) {
  await shot('failure');
  throw e;
} finally {
  writeFileSync(resolve(out, 'console.json'), JSON.stringify(consoleEntries, null, 2));
  if (native) browser.disconnect();
  else await browser.close();
}
