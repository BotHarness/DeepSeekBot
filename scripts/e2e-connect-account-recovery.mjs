import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    label: { type: 'string' },
    expected: { type: 'string', default: 'sign-in' },
    theme: { type: 'string', default: 'light' },
    locale: { type: 'string', default: 'en' },
  },
});
assert.match(values.name ?? '', /^[a-z0-9-]+$/);
assert.match(values.label ?? '', /^[a-z0-9-]+$/);
assert.ok(['automatic', 'sign-in', 'legacy'].includes(values.expected));
assert.ok(['light', 'dark'].includes(values.theme));
assert.ok(['en', 'zh'].includes(values.locale));
const root = resolve(import.meta.dirname, '..');
const directory = join(root, '.humanlayer', 'verify', values.name);
const instance = JSON.parse(readFileSync(join(directory, 'instance.json'), 'utf8'));
const store = join(root, 'node_modules', '.pnpm');
const installed = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
assert.ok(installed, 'Install workspace dependencies first');
const puppeteer = createRequire(join(store, installed, 'node_modules', '/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox'],
  protocolTimeout: 120_000,
});
const zh = values.locale === 'zh';
const lang = zh ? 'zh-CN' : 'en-US';
const consoleIssues = [];
const evidence = join(directory, 'evidence');
mkdirSync(evidence, { recursive: true });
const target = join(evidence, values.label);
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.setExtraHTTPHeaders({ 'accept-language': lang });
  await page.evaluateOnNewDocument((language) => {
    Object.defineProperty(navigator, 'language', { get: () => language });
    Object.defineProperty(navigator, 'languages', { get: () => [language] });
  }, lang);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: values.theme }]);
  page.on('console', (message) => {
    if (['error', 'warn'].includes(message.type()))
      consoleIssues.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleIssues.push(`pageerror: ${error.message}`));
  const click = (name) => page.locator(`::-p-aria(${JSON.stringify(name)})`).click();
  const dismiss = async () => {
    for (let index = 0; index < 4; index += 1) {
      const label = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .find(
            (node) =>
              [
                'Continue',
                '继续',
                'Configure later',
                '稍后配置',
                'Skip tutorial',
                '跳过教程',
                'Skip',
                '跳过',
              ].includes(node.textContent?.trim()) && node.offsetParent !== null,
          )
          ?.textContent?.trim(),
      );
      if (!label) break;
      await click(label);
      await new Promise((done) => setTimeout(done, 400));
    }
  };
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await dismiss();
  if (!(await page.$('.bh-root.bh-main'))) await click(zh ? 'Bot 模式' : 'Bot mode');
  await page.waitForSelector('::-p-aria(' + JSON.stringify(zh ? 'Bot 设置' : 'Bot settings') + ')');
  await dismiss();
  await click(zh ? 'Bot 设置' : 'Bot settings');
  await click(zh ? '连接' : 'Connections');
  await click(zh ? '管理' : 'Manage');
  const issue = await page.waitForSelector('[data-connect-issue="relay-unavailable"]');
  const message = await issue.evaluate((node) => node.textContent);
  const automatic = values.expected !== 'sign-in';
  assert.equal(
    message,
    zh
      ? automatic
        ? '暂时连不上 Tobs 服务，稍后会自动重试。'
        : '暂时连不上 Tobs 服务，稍后重新登录。'
      : automatic
        ? 'The Tobs service is unreachable right now. This computer retries on its own.'
        : 'Cannot reach the Tobs service. Try signing in again later.',
  );
  const account = await page.evaluate(
    async () => (await (await fetch('./api/botharness/devices')).json()).connect.account,
  );
  assert.equal(account.state, 'error');
  assert.equal(account.issue, 'relay-unavailable');
  assert.equal(account.recovery, values.expected === 'legacy' ? undefined : values.expected);
  const panel = await page.$('[data-connect]');
  await panel.screenshot({ path: `${target}.png` });
  writeFileSync(
    `${target}.aria.json`,
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  writeFileSync(
    `${target}.json`,
    JSON.stringify(
      {
        expected: values.expected,
        theme: values.theme,
        locale: values.locale,
        message,
        account,
        consoleIssues,
      },
      null,
      2,
    ),
  );
  assert.equal(consoleIssues.length, 0, 'Inspect the saved browser console evidence');
  console.log(
    JSON.stringify({
      ok: true,
      expected: values.expected,
      theme: values.theme,
      locale: values.locale,
      screenshot: `${target}.png`,
      consoleIssues: 0,
    }),
  );
} catch (error) {
  await page?.screenshot({ path: `${target}.failure.png` }).catch(() => {});
  writeFileSync(
    `${target}.failure.json`,
    JSON.stringify({ message: error.message, consoleIssues }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
