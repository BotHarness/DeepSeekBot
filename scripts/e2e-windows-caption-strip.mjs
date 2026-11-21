import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = resolve(root, 'node_modules/.pnpm');
const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(store, entry, 'node_modules/'))('puppeteer');
const instancePath = process.env.BH_E2E_INSTANCE;
assert.ok(instancePath, 'Set BH_E2E_INSTANCE to an isolated verify-app instance.json');
const windowsButtonReserve = 144;
const { url, dshVersion } = JSON.parse(readFileSync(instancePath, 'utf8'));

const browser = await puppeteer.launch({ headless: true, args: ['--lang=en-US'] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US'] });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.goto(url, { waitUntil: 'networkidle2' });

  const shellOverlay = await page.waitForSelector('[data-shell-overlay]');
  await shellOverlay.evaluate((overlay) => {
    const html = document.documentElement;
    html.dataset.windowsTitlebar = '';
    html.style.setProperty('--dsh-windows-titlebar-height', '40px');
    overlay.parentElement.dataset.captionProbeFrame = '';

    const menu = document.createElement('div');
    menu.dataset.windowsMenu = '';
    menu.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { position:fixed; top:0; left:48px; height:var(--dsh-windows-titlebar-height);
          display:flex; align-items:center; -webkit-app-region:no-drag; }
        button { height:28px; padding:0 10px; }
      </style>
      <div role="menubar"><button>Application</button><button>Edit</button></div>`;
    document.body.append(menu);
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-caption-probe-frame]');
    return getComputedStyle(frame, '::before').content !== 'none';
  });
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable');
  const { root: documentNode } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: documentNode.nodeId,
    selector: '[data-caption-probe-frame]',
  });

  async function snapshot() {
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    const pseudo = node.pseudoElements?.find(({ pseudoType }) => pseudoType === 'before');
    assert.ok(pseudo, 'DSH AppFrame renders the caption pseudo-element');
    const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: pseudo.backendNodeId });
    return page.evaluate(
      ({ border: [left, top, right, , , bottom], windowsButtonReserve }) => {
        const frame = document.querySelector('[data-caption-probe-frame]');
        const menu = document.querySelector('[data-windows-menu]');
        const main = frame.querySelector(':scope > [data-rightbar-col]').previousElementSibling;
        const captionBox = new DOMRect(left, top, right - left, bottom - top);
        const caption = getComputedStyle(frame, '::before');
        const frameBox = frame.getBoundingClientRect();
        const { right: menuEnd } = menu.getBoundingClientRect();
        const { height } = captionBox;
        const controlsStart = frameBox.right - windowsButtonReserve;
        const regions = [];
        const append = (box, region) => {
          if (box.width > 0 && box.height > 0 && ['drag', 'no-drag'].includes(region)) {
            regions.push({
              left: box.left,
              top: box.top,
              right: box.right,
              bottom: box.bottom,
              region,
            });
          }
        };
        for (const node of document.querySelectorAll('*')) {
          const css = getComputedStyle(node);
          if (css.visibility !== 'visible' || css.display === 'none') continue;
          append(node.getBoundingClientRect(), css.getPropertyValue('app-region'));
          if (node === frame && caption.content !== 'none') {
            append(captionBox, caption.getPropertyValue('app-region'));
          }
        }
        const regionAt = (x, y) =>
          regions.findLast(
            (box) => x >= box.left && x < box.right && y >= box.top && y < box.bottom,
          )?.region ?? 'none';
        const midpointRegion = (node) => {
          const box = node.getBoundingClientRect();
          return regionAt(box.left + box.width / 2, box.top + box.height / 2);
        };
        const rows = [frameBox.top + 2, frameBox.top + height / 2, frameBox.top + height - 2];
        let deadPoints = 0;
        let firstDeadPoint = null;
        for (const y of rows) {
          for (let x = Math.ceil(menuEnd); x < controlsStart; x++) {
            if (regionAt(x, y) === 'drag') continue;
            deadPoints++;
            firstDeadPoint ??= { x, y };
          }
        }
        const exit = document.querySelector('.bh-workspace-exit');
        return {
          bot: frame.hasAttribute('data-bh-workspace-frame'),
          height,
          strip: controlsStart - menuEnd,
          deadPoints,
          firstDeadPoint,
          menus: Array.from(menu.shadowRoot.querySelectorAll('button'), midpointRegion),
          exit: exit ? midpointRegion(exit) : null,
          mainTop: main.getBoundingClientRect().top,
          captionBottom: captionBox.bottom,
        };
      },
      { border: model.border, windowsButtonReserve },
    );
  }

  async function verify(mode, bot) {
    const result = await snapshot();
    assert.equal(result.bot, bot, `${mode}: workspace ownership`);
    assert.equal(result.height, 40, `${mode}: caption height`);
    assert.ok(result.mainTop >= result.captionBottom, `${mode}: content clears caption`);
    assert.ok(result.strip > 0, `${mode}: blank strip between menu and caption buttons`);
    assert.deepEqual(result.menus, ['no-drag', 'no-drag'], `${mode}: native menu cutouts`);
    assert.equal(result.exit, bot ? 'no-drag' : null, `${mode}: Bot exit is interactive`);
    assert.equal(
      result.deadPoints,
      0,
      `${mode}: blank caption strip loses drag at ${JSON.stringify(result.firstDeadPoint)}`,
    );
    return result;
  }

  const onboarding = await page.$('[aria-modal="true"] button[aria-label="Close"]');
  if (onboarding) await onboarding.click();

  const session = await verify('Session', false);
  await page.locator('button[aria-label="Bot mode"]').click();
  await page.waitForSelector('[data-workspace-dock]');
  const skip = await page.$('::-p-aria(Skip)');
  if (skip) await skip.click();
  await page.keyboard.press('Escape');
  const bot = await verify('Bot', true);
  await page.addStyleTag({
    content:
      '[data-caption-probe-frame][data-bh-workspace-frame]::before { -webkit-app-region: initial !important; }',
  });
  const botWithMissingCaption = await snapshot();
  await assert.rejects(verify('Bot', true), /Bot: blank caption strip loses drag/);
  await page.locator('::-p-aria(Exit Bot mode)').click();
  await page.waitForSelector('[data-workspace-dock]', { hidden: true });
  const sessionAfterExit = await verify('Session after Bot', false);
  console.log(
    JSON.stringify(
      {
        dshVersion,
        evidence: 'Chromium renderer geometry with simulated Windows chrome',
        session,
        bot,
        sessionAfterExit,
        negativeControl: {
          botDeadPoints: botWithMissingCaption.deadPoints,
          firstDeadPoint: botWithMissingCaption.firstDeadPoint,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
