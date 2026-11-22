#!/usr/bin/env node

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { stylexPlugin } from './stylex-plugin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'scripts/ui-visual/gallery.tsx');
const require = createRequire(join(root, 'scripts/stylex-plugin.mjs'));
const clientRequire = createRequire(join(root, 'packages/client/package.json'));
const TOLERANCE = 0.5;
export const BASELINES = join(root, 'scripts/ui-visual/baselines.json');
const PIXEL_SHARE = 0.0002;
const ADOPT = 'node scripts/ui-visual-baseline.mjs --run <verify run id>';
const WIDE = { width: 1100, height: 900 };
const COMPACT = { width: 599, height: 900 };

export function geometryProblems(cases) {
  const problems = [];
  for (const entry of cases) {
    const { id, heading, items, rowHeight, iconSlot } = entry;
    const column = items[0]?.labelX;
    for (const item of items) {
      if (Math.abs(item.labelX - column) > TOLERANCE)
        problems.push(
          `${id}: nav label "${item.label}" starts at x=${item.labelX}, not on the label column x=${column}`,
        );
      if (Math.abs(item.height - rowHeight) > TOLERANCE)
        problems.push(
          `${id}: nav row "${item.label}" is ${item.height}px tall; the row token is ${rowHeight}px`,
        );
      if (Math.abs(item.slotWidth - iconSlot) > TOLERANCE)
        problems.push(
          `${id}: icon slot of "${item.label}" is ${item.slotWidth}px wide; the slot token is ${iconSlot}px`,
        );
    }
    if (heading && column !== undefined && Math.abs(heading.labelX - column) > TOLERANCE)
      problems.push(
        `${id}: group heading starts at x=${heading.labelX}, not on the label column x=${column}`,
      );
  }
  return problems;
}

export async function pixelProblems(cases, manifest, { fetcher = fetch, out } = {}) {
  const { PNG } = require('pngjs');
  const pixelmatch = (await import(pathToFileURL(require.resolve('pixelmatch')).href)).default;
  const problems = [];
  for (const { id, png } of cases) {
    const url = manifest[id];
    if (!url) {
      problems.push(`${id}: no baseline screenshot; adopt the new ones with ${ADOPT}`);
      continue;
    }
    const response = await fetcher(url);
    if (!response.ok) {
      problems.push(`${id}: baseline ${url} answered ${response.status}`);
      continue;
    }
    const expected = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
    const actual = PNG.sync.read(png);
    if (expected.width !== actual.width || expected.height !== actual.height) {
      problems.push(
        `${id}: size changed from ${expected.width}×${expected.height} to ${actual.width}×${actual.height}; review the ui-visual artifact, then ${ADOPT}`,
      );
      continue;
    }
    const diff = new PNG({ width: actual.width, height: actual.height });
    const changed = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, {
      threshold: 0.1,
    });
    if (changed > actual.width * actual.height * PIXEL_SHARE) {
      problems.push(
        `${id}: ${changed} pixels differ from the baseline; review diff-${id}.png in the ui-visual artifact, then ${ADOPT}`,
      );
      if (out) writeFileSync(join(out, `diff-${id}.png`), PNG.sync.write(diff));
    }
  }
  return problems;
}

export function overflowProblems(label, scan) {
  const problems = [];
  if (scan.pageScroll > 0)
    problems.push(`${label}: the page scrolls ${scan.pageScroll}px horizontally`);
  for (const clip of scan.clipped)
    problems.push(
      `${label}: ${clip.id} clips "${clip.text}" (${clip.scroll}px in ${clip.client}px)`,
    );
  return problems;
}

export function axeProblems(label, violations) {
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${label}: ${violation.id} (${violation.impact}) at ${node.target.join(' ')}: ${violation.help}`,
    ),
  );
}

async function bundle() {
  const { build } = await import(
    pathToFileURL(createRequire(require.resolve('vitest/package.json')).resolve('vite')).href
  );
  const built = await build({
    root,
    logLevel: 'error',
    configFile: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [stylexPlugin({ rootDir: root })],
    resolve: {
      alias: {
        react: dirname(clientRequire.resolve('react/package.json')),
        'react-dom': dirname(clientRequire.resolve('react-dom/package.json')),
      },
    },
    build: { write: false, lib: { entry, formats: ['es'] } },
  });
  const chunks = built.output ?? built[0].output;
  const script = chunks.find((chunk) => chunk.type === 'chunk' && chunk.isEntry).fileName;
  const assets = new Map(
    chunks.map((chunk) => [
      '/' + chunk.fileName,
      chunk.type === 'chunk' ? chunk.code : chunk.source,
    ]),
  );
  const css = chunks
    .filter((chunk) => chunk.type === 'asset' && chunk.fileName.endsWith('.css'))
    .map((chunk) => chunk.source)
    .join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tobs gallery</title><style>${css}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}</style></head><body><div id="app"></div><script type="module" src="/${script}"></script></body></html>`;
  return { assets, html };
}

function launchPuppeteer() {
  const store = join(root, 'node_modules/.pnpm');
  const name = readdirSync(store).find((entry) => entry.startsWith('puppeteer@'));
  if (!name) throw Error('puppeteer is not installed; run pnpm install');
  return createRequire(join(store, name, 'node_modules/'))('puppeteer');
}

async function measure(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-gallery-case]')].map((section) => {
      const nav = section.querySelector('[data-gallery-nav]');
      const style = getComputedStyle(section);
      const px = (name) => Number.parseFloat(style.getPropertyValue(name));
      const left = (element) => Math.round(element.getBoundingClientRect().left * 100) / 100;
      const items = [...nav.querySelectorAll('button')].map((button) => {
        const [slot, label] = button.children;
        return {
          label: label.textContent,
          labelX: left(label),
          slotWidth: slot.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
        };
      });
      const heading = nav.querySelector(':scope > [id]');
      return {
        id: section.dataset.galleryCase,
        rowHeight: px('--tobs-style-row-nav'),
        iconSlot: px('--tobs-style-icon-slot'),
        heading: heading ? { labelX: left(heading.firstElementChild) } : null,
        items,
      };
    }),
  );
}

async function scanOverflow(page) {
  return page.evaluate(() => {
    const clipped = [];
    for (const section of document.querySelectorAll('[data-gallery-case]'))
      for (const element of section.querySelectorAll('*')) {
        if (element.closest('svg') || element.children.length) continue;
        const text = element.textContent.trim();
        if (!text) continue;
        const style = getComputedStyle(element);
        const hides = style.overflowX !== 'visible' || style.overflow !== 'visible';
        const intended = style.textOverflow === 'ellipsis';
        if (hides && !intended && element.scrollWidth > element.clientWidth + 1)
          clipped.push({
            id: section.dataset.galleryCase,
            text: text.slice(0, 40),
            scroll: element.scrollWidth,
            client: element.clientWidth,
          });
      }
    return {
      pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped,
    };
  });
}

async function keyboardWalk(page) {
  const expected = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll('[data-gallery-case] :is(button, input, [tabindex="0"])'),
      ].filter((element) => !element.disabled && element.tabIndex >= 0).length,
  );
  await page.evaluate(() => document.activeElement?.blur());
  const problems = [];
  const seen = new Set();
  for (let step = 0; step < expected + 5; step += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const box = element.getBoundingClientRect();
      const name = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30);
      const caseId = element.closest('[data-gallery-case]')?.dataset.galleryCase ?? 'page';
      return {
        key: `${caseId}:${name}:${Math.round(box.left)}:${Math.round(box.top)}`,
        label: `${caseId} "${name}"`,
        visible: element.matches(':focus-visible'),
        box: { x: box.left, y: box.top + window.scrollY, width: box.width, height: box.height },
      };
    });
    if (!info || seen.has(info.key)) break;
    seen.add(info.key);
    const clip = {
      x: Math.max(0, info.box.x - 4),
      y: Math.max(0, info.box.y - 4),
      width: info.box.width + 8,
      height: info.box.height + 8,
    };
    const focused = await page.screenshot({
      clip,
      encoding: 'base64',
      captureBeyondViewport: true,
    });
    await page.evaluate(() => document.activeElement?.blur());
    const resting = await page.screenshot({
      clip,
      encoding: 'base64',
      captureBeyondViewport: true,
    });
    await page.evaluate((key) => {
      const match = [...document.querySelectorAll('[data-gallery-case] :is(button, input)')].find(
        (element) => {
          const box = element.getBoundingClientRect();
          const name =
            element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30);
          const caseId = element.closest('[data-gallery-case]')?.dataset.galleryCase ?? 'page';
          return `${caseId}:${name}:${Math.round(box.left)}:${Math.round(box.top)}` === key;
        },
      );
      match?.focus({ focusVisible: true });
    }, info.key);
    if (!info.visible || focused === resting)
      problems.push(`${info.label}: keyboard focus shows no visible focus ring`);
  }
  if (seen.size < expected)
    problems.push(`keyboard: Tab reached ${seen.size} of ${expected} controls`);
  return problems;
}

export async function run({ screenshots } = {}) {
  const { assets, html } = await bundle();
  const server = createServer((request, response) => {
    const body = assets.get(request.url);
    response.setHeader('content-type', body === undefined ? 'text/html' : 'text/javascript');
    response.end(body ?? html);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const puppeteer = launchPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  });
  const problems = [];
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport(WIDE);
    await page.goto(origin, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-gallery-case]');
    if (errors.length) problems.push(...errors.map((error) => `gallery: ${error}`));
    await page.mouse.move(0, 0);
    const cases = [];
    for (const section of await page.$$('[data-gallery-case]'))
      cases.push({
        id: await section.evaluate((element) => element.dataset.galleryCase),
        png: Buffer.from(await section.screenshot()),
      });
    if (screenshots) {
      mkdirSync(screenshots, { recursive: true });
      for (const { id, png } of cases) writeFileSync(join(screenshots, `case-${id}.png`), png);
    }
    const manifest = existsSync(BASELINES) ? JSON.parse(readFileSync(BASELINES, 'utf8')) : {};
    if (Object.keys(manifest).length)
      problems.push(...(await pixelProblems(cases, manifest, { out: screenshots })));
    else console.log('UI visual checks: no pixel baselines recorded yet; screenshots only');
    problems.push(...geometryProblems(await measure(page)));
    await page.addScriptTag({ content: readFileSync(require.resolve('axe-core'), 'utf8') });
    const axe = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return result.violations.map(({ id, impact, help, nodes }) => ({
        id,
        impact,
        help,
        nodes: nodes.map(({ target }) => ({ target })),
      }));
    });
    problems.push(...axeProblems('axe', axe));
    problems.push(...(await keyboardWalk(page)));
    if (screenshots)
      await page.screenshot({ path: join(screenshots, 'gallery-wide.png'), fullPage: true });
    for (const [label, viewport, zoom] of [
      ['compact', COMPACT, 1],
      ['200% zoom', WIDE, 2],
    ]) {
      await page.setViewport(viewport);
      await page.evaluate((value) => {
        document.documentElement.style.zoom = String(value);
      }, zoom);
      problems.push(...overflowProblems(label, await scanOverflow(page)));
      if (screenshots)
        await page.screenshot({
          path: join(screenshots, `gallery-${label.replace(/\W+/gu, '-')}.png`),
          fullPage: true,
        });
    }
  } finally {
    await browser.close();
    server.close();
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: { screenshots: { type: 'string' } } });
  const problems = await run({ screenshots: values.screenshots });
  if (problems.length) {
    console.error(`UI visual checks (G2, #4295):\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log('UI visual checks: alignment, accessibility, keyboard and zoom pass');
}
