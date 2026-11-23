import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE, 'Set the task-owned instance.json');
const natural = process.argv.includes('--natural');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(
  process.env.BH_SCREENSHOT_DIR ?? dirname(process.env.BH_E2E_INSTANCE),
  `client-settings-tob-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const errors = [];
const steps = [];
const cli = async (command, args = [], stdin) => {
  const url = new URL(instance.url);
  const child = execFile(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', command, '--host', url.origin, ...args],
    {
      env: { ...process.env, DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token') },
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  child.stdin.end(stdin === undefined ? undefined : JSON.stringify(stdin));
  return new Promise((done, fail) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (v) => (stdout += v));
    child.stderr.on('data', (v) => (stderr += v));
    child.on('exit', (code) => {
      try {
        const value = JSON.parse(stdout || stderr);
        steps.push({ command, args, code, value });
        done({ code, value });
      } catch {
        fail(Error(`CLI returned invalid JSON: ${stdout}${stderr}`));
      }
    });
  });
};
const ok = async (...args) => {
  const result = await cli(...args);
  assert.equal(result.code, 0, JSON.stringify(result.value));
  return result.value;
};
async function dismiss(page) {
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .find(
          (b) =>
            [
              'Continue',
              'Configure later',
              'Skip tutorial',
              'Skip',
              'Close',
              'Don’t show again',
            ].includes(b.textContent.trim() || b.getAttribute('aria-label')) && b.offsetParent,
        )
        ?.click(),
    );
    await sleep(200);
  }
}
const shot = async (page, name) => {
  await sleep(600);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
};
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(e.message));
try {
  const before = (await ok('appearance-clients')).clients.map((c) => c.id);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await dismiss(page);
  if (!(await page.$('.bh-workspace-rail')))
    await page.locator('::-p-aria(Bot mode[role="button"])').click();
  await page.waitForSelector('.bh-workspace-rail');
  await sleep(800);
  await dismiss(page);
  let client;
  for (let i = 0; i < 40 && !client; i++) {
    const fresh = (await ok('appearance-clients')).clients
      .map((c) => c.id)
      .filter((id) => !before.includes(id));
    if (fresh.length === 1) client = fresh[0];
    else await sleep(250);
  }
  assert.ok(client, 'one new Client');
  const row = await page.evaluate(() => {
    const node = [...document.querySelectorAll('button, [role="button"]')].find(
      (n) => n.offsetParent && /(^|\n)Tob\s*\n/u.test(n.innerText ?? ''),
    );
    const r = node?.getBoundingClientRect();
    return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  assert.ok(row, 'visible Tob row');
  await page.mouse.click(row.x, row.y);
  await sleep(800);
  const keys = await ok('client-shortcuts-get', ['--client-id', client]);
  const altU = { code: 'KeyU', mod: false, alt: true, shift: false };
  if (natural) {
    await page
      .locator('::-p-aria(Message Tob)')
      .fill(
        `Using the deepseekbot CLI, change the quick-switcher shortcut on browser Client ${client} to Alt+U (code KeyU, alt only). Read its current shortcuts first and use that revision. Do not change anything else.`,
      );
    await page.keyboard.press('Enter');
  } else {
    const started = await ok('tob-cli', ['start', '--args-stdin'], {
      argv: [
        'client-shortcuts-set',
        '--client-id',
        client,
        '--patch-stdin',
        '--expected-revision',
        keys.revision,
      ],
      stdin: JSON.stringify({ action: 'quick-switcher', binding: altU }),
    });
    steps.push({ started });
  }
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Allow once' && b.offsetParent && !b.disabled,
      ),
    { timeout: natural ? 240000 : 60000 },
  );
  await shot(page, '01-tob-approval-card');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Allow once' && b.offsetParent && !b.disabled)
      .click(),
  );
  const approvedAt = Date.now();
  const channel = (await ok('channels')).channels.find((c) => c.name === 'Tob').id;
  for (let i = 0; i < (natural ? 60 : 20); i++) {
    await sleep(natural ? 4000 : 1000);
    const [last] = (await ok('channel-messages', [channel, '--limit', '1'])).messages;
    const settled =
      last.author.kind === 'bot' &&
      Date.parse(last.at) > approvedAt &&
      !/approval|批准/u.test(last.body ?? '');
    if (settled) break;
  }
  const after = await ok('client-shortcuts-get', ['--client-id', client]);
  assert.deepEqual(after.actions.find((x) => x.id === 'quick-switcher').binding, altU);
  await page.evaluate(() => {
    for (const n of document.querySelectorAll('*'))
      if (n.scrollHeight > n.clientHeight + 20 && getComputedStyle(n).overflowY !== 'visible')
        n.scrollTop = n.scrollHeight;
  });
  await shot(page, '02-tob-result');
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyU');
  await page.keyboard.up('Alt');
  await page.waitForSelector('[role="listbox"]');
  await shot(page, '03-tob-shortcut-works');
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ natural, steps, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: out }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ natural, steps, errors }, null, 2));
  console.error(out);
  throw error;
} finally {
  await browser.close();
}
