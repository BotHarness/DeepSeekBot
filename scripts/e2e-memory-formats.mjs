import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const name = arg('--name');
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Use --name <task-owned instance>');
const before = process.argv.includes('--before');
const phase = before ? 'before' : 'after';
const task = resolve('.humanlayer/verify', name, 'memory-formats');
mkdirSync(task, { recursive: true });
const instance = JSON.parse(readFileSync(resolve('.humanlayer/verify', name, 'instance.json')));
if (!instance.home.includes(name) || !instance.worktree)
  throw new Error('Task Host ownership missing');
const login = new URL(instance.url);
const env = {
  ...process.env,
  DEEPSEEKBOT_HOST: login.origin,
  DEEPSEEKBOT_HOST_TOKEN: login.searchParams.get('token'),
};
const cli = (...args) => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(before ? instance.worktree : '.', 'packages/deepseekbot/dist/deepseekbot.mjs'),
      ...args,
      '--compact',
    ],
    { env, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(`CLI ${args[0]} refused: ${result.stdout.slice(0, 1000)}`);
  return JSON.parse(result.stdout);
};
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const expected = before ? arg('--expected-source') : head;
const identity = cli('release-info').identity.source;
if (!expected || identity.revision !== expected || identity.dirty)
  throw new Error('Use a clean, rebuilt exact-source task Host');
const rpc = (method, args) => {
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-app.mjs', 'rpc', `botharness/${method}`, JSON.stringify(args), '--name', name],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`Fixture ${method} refused`);
  return JSON.parse(result.stdout);
};
const formats = [
  ['jpg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg+xml'],
];
const fixture = (color, extension) =>
  readFileSync(resolve('packages/core/test/fixtures/memory-images', `${color}.${extension}`));
const seedFile = resolve(task, 'fixture.json');
let seed;
if (existsSync(seedFile)) seed = JSON.parse(readFileSync(seedFile));
else {
  const created = cli(
    'create',
    '--name',
    'Image Formats QA',
    '--persona',
    'Synthetic Memory image verification. No model calls.',
  );
  const slug = created.bot.id;
  const memory = rpc('get', { slug }).bot.memoryDir;
  const git = (...args) =>
    execFileSync('git', ['-C', memory, ...args], { encoding: 'utf8' }).trim();
  mkdirSync(resolve(memory, 'notes'), { recursive: true });
  const body = (color) =>
    `# Image formats — ${color}\n\nOriginal version-bound image bytes.\n\n` +
    formats.map(([ext]) => `![${ext.toUpperCase()} diagram](../preview.${ext})\n`).join('\n');
  const paths = [...formats.map(([ext]) => `preview.${ext}`), 'notes/formats.md'];
  for (const color of ['blue', 'orange']) {
    for (const [ext] of formats)
      writeFileSync(resolve(memory, `preview.${ext}`), fixture(color, ext));
    writeFileSync(resolve(memory, 'notes/formats.md'), body(color));
    git('add', '--', ...paths);
    git(
      '-c',
      'user.name=Formats QA',
      '-c',
      'user.email=qa@example.invalid',
      'commit',
      '-m',
      `Image format ${color}`,
    );
  }
  const commit = git('rev-parse', 'HEAD');
  for (const [ext] of formats)
    writeFileSync(resolve(memory, `preview.${ext}`), fixture('green', ext));
  writeFileSync(resolve(memory, 'notes/formats.md'), body('green'));
  for (const ext of ['gif', 'webp'])
    writeFileSync(resolve(memory, `animated.${ext}`), fixture('animated', ext));
  writeFileSync(
    resolve(memory, 'unsafe.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" onload="window.svgExecuted=true"><image href="https://svg-resource.invalid/leak.png"/><script>window.svgExecuted=true</script></svg>',
  );
  seed = { slug, memory, channelId: created.dm.channelId, commit };
  writeFileSync(seedFile, JSON.stringify(seed, null, 2));
}
const out = resolve(task, phase, `attempt-${Date.now()}`);
mkdirSync(out, { recursive: true });
const store = resolve('node_modules/.pnpm');
const pkg = readdirSync(store).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(store, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const errors = [],
  expectedErrors = [],
  forbiddenRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (
    message.location().url?.includes('/memory/image?') &&
    (before || message.text().includes('400'))
  )
    expectedErrors.push(message.text());
  else errors.push(message.text().slice(0, 500));
});
page.on('request', (request) => {
  if (request.url().includes('svg-resource.invalid')) forbiddenRequests.push(request.url());
});
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setUserAgentOverride', {
  userAgent: await browser.userAgent(),
  acceptLanguage: 'en-US,en',
});
const click = (label) =>
  page
    .locator(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`)
    .setTimeout(12000)
    .click();
const maybe = async (label) => {
  const element = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
  if (element && (await element.isVisible())) await element.click();
};
const capture = async (label) => {
  const viewport = page.viewport();
  const clip = viewport.width === 1440 ? { x: 326, y: 0, width: 1114, height: 1000 } : undefined;
  await page.waitForSelector('.bh-memory-commit-view', { visible: true });
  await page.screenshot({ path: resolve(out, `${label}.png`), clip, captureBeyondViewport: false });
  writeFileSync(
    resolve(out, `${label}.aria.json`),
    JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }), null, 2),
  );
};
const openFile = async (path) => {
  await click('Memory files');
  const parts = path.split('/');
  if (parts.length === 1) {
    const parent = await page.$('::-p-aria([name="Back to parent folder"][role="button"])');
    if (parent && (await parent.isVisible())) await parent.click();
  }
  for (const part of parts)
    await page.locator(`::-p-aria([name=${JSON.stringify(part)}][role="treeitem"])`).click();
  await page.waitForSelector('.bh-memory-commit-view');
  await click('Close Memory files');
};
const decoded = () =>
  page.waitForFunction(() =>
    [...document.querySelectorAll('.bh-memory-commit-view img')].some(
      (image) => image.naturalWidth === 160,
    ),
  );
const working = async (path) => {
  await page.waitForFunction(
    (wanted) =>
      [...document.querySelectorAll('.bh-memory-working-list .bh-memory-row')].some((node) =>
        node.textContent.includes(wanted),
      ),
    {},
    path,
  );
  const rows = await page.$$('.bh-memory-working-list .bh-memory-row');
  for (const row of rows)
    if ((await row.evaluate((node) => node.textContent)).includes(path)) {
      await row.click();
      return;
    }
  throw new Error('Working image row missing');
};
let stage = 'open';
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(instance.url, { waitUntil: 'networkidle2', timeout: 30000 });
  for (let i = 0; i < 4; i++) {
    for (const label of ['Continue', 'Configure later', 'Skip tutorial']) await maybe(label);
    await new Promise((r) => setTimeout(r, 150));
  }
  await click('Bot mode');
  await page.waitForSelector('.bh-root.bh-main');
  await click('Image Formats QA: Idle Image Formats QA No messages yet');
  if (await page.$('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]'))
    await click('Messages · ⌥ ⇧ ⌘ 2');
  for (const label of ['Close Home', 'Close Sessions']) await maybe(label);
  const pixels = {};
  for (const [ext] of formats) {
    stage = `current-${ext}`;
    await openFile(`preview.${ext}`);
    if (!before) {
      await decoded();
      pixels[ext] = await page.$eval('.bh-memory-commit-view img', (image) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 2;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return [...context.getImageData(1, 1, 1, 1).data];
      });
      if (Math.abs(pixels[ext][1] - 112) > 12 || pixels[ext][3] !== 255)
        throw new Error(`Unexpected decoded ${ext} colour`);
    } else await page.waitForFunction(() => !document.querySelector('.bh-memory-commit-view img'));
    await capture(`current-${ext}-light`);
    if (!before && ext === 'webp') {
      await click('View image preview.webp');
      await page.waitForSelector('[role="dialog"] img');
      await capture('enlarged-webp');
      await page.keyboard.press('Escape');
    }
    if (ext === 'svg') {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
      await capture('current-svg-dark');
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    }
  }
  stage = 'markdown';
  await openFile('notes/formats.md');
  for (const [ext] of formats) {
    if (!before) {
      const selector = `.bh-memory-markdown img[alt="${ext.toUpperCase()} diagram"]`;
      await page.waitForSelector(selector);
      await page.$eval(selector, (image) => image.scrollIntoView({ block: 'center' }));
      await page.waitForFunction(
        (query) => document.querySelector(query)?.naturalWidth === 160,
        {},
        selector,
      );
    }
  }
  await page.$eval('.bh-memory-commit-view', (node) => {
    node.scrollTop = 0;
  });
  await capture('markdown-light');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await capture('markdown-dark');
  if (!before) {
    await click('View source');
    await capture('markdown-source');
    await click('Rendered preview');
  }
  stage = 'working';
  await click('Memory evolution');
  await working('preview.webp');
  await click('Close Memory evolution');
  if (!before)
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.bh-memory-commit-view img')].filter(
          (image) => image.naturalWidth === 160,
        ).length === 2,
    );
  await capture('working-webp-dark');
  stage = 'history';
  await click('Memory evolution');
  await page.locator(`button[title="${seed.commit}"]`).click();
  await click('Close Memory evolution');
  await page.waitForSelector('.bh-memory-diff-file-name[title="preview.webp"]');
  await page.$eval('.bh-memory-diff-file-name[title="preview.webp"]', (node) =>
    node.closest('.bh-memory-diff-file').scrollIntoView({ block: 'start' }),
  );
  if (!before)
    await page.waitForFunction(() => {
      const section = document
        .querySelector('.bh-memory-diff-file-name[title="preview.webp"]')
        .closest('.bh-memory-diff-file');
      section.scrollIntoView({ block: 'start' });
      const images = [...section.querySelectorAll('img')];
      return images.length === 2 && images.every((image) => image.naturalWidth === 160);
    });
  await capture('history-dark');
  const animations = {};
  if (!before)
    for (const ext of ['gif', 'webp']) {
      stage = `animation-${ext}`;
      await openFile(`animated.${ext}`);
      await decoded();
      const values = new Set();
      const seen = new Set();
      for (let i = 0; i < 16; i++) {
        const point = await page.$eval('.bh-memory-commit-view img', (image) => {
          const rect = image.getBoundingClientRect();
          return {
            x: Math.floor(rect.x + rect.width / 4) - 326,
            y: Math.floor(rect.y + rect.height / 4),
          };
        });
        const shot = await page.screenshot({
          clip: { x: 326, y: 0, width: 1114, height: 1000 },
          captureBeyondViewport: false,
          encoding: 'base64',
        });
        const pixel = await page.evaluate(
          async (encoded, point) => {
            const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.drawImage(bitmap, point.x, point.y, 1, 1, 0, 0, 1, 1);
            bitmap.close();
            return [...context.getImageData(0, 0, 1, 1).data];
          },
          shot,
          point,
        );
        values.add(pixel.join(','));
        const color =
          pixel[3] === 255 && pixel[2] > pixel[0] + 70
            ? 'blue'
            : pixel[3] === 255 && pixel[0] > pixel[2] + 70
              ? 'orange'
              : undefined;
        if (color && !seen.has(color)) {
          seen.add(color);
          writeFileSync(resolve(out, `animated-${ext}-${color}.png`), Buffer.from(shot, 'base64'));
        }
        await new Promise((r) => setTimeout(r, 65));
      }
      if (seen.size !== 2)
        throw new Error(
          `Animation did not show both rendered fixture frames: ${ext}: ${[...values]}`,
        );
      animations[ext] = [...values];
      await capture(`animated-${ext}`);
    }
  stage = 'unsafe';
  await openFile('unsafe.svg');
  await page.waitForFunction(
    (base) =>
      document
        .querySelector('.bh-memory-commit-view')
        ?.textContent.includes(base ? '<svg' : 'supported'),
    {},
    before,
  );
  await capture('unsafe-svg');
  stage = 'narrow';
  await page.setViewport({ width: 700, height: 1000 });
  await page.waitForSelector('.bh-mobile-shell[data-page="list"]', { visible: true });
  await page.locator(`.bh-mobile-list button[data-channel-id="${seed.channelId}"]`).click();
  await page.waitForSelector('.bh-mobile-shell[data-page="conversation"]', { visible: true });
  await click('Conversation settings');
  await click('Memory');
  await working('preview.webp');
  await page.keyboard.press('Escape');
  if (!before) {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.bh-memory-commit-view figure img').length === 2 &&
        [...document.querySelectorAll('.bh-memory-commit-view figure img')].every(
          (image) => image.naturalWidth === 160,
        ),
    );
    const boxes = await page.$$eval('.bh-memory-commit-view figure', (nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    if (boxes.length !== 2 || Math.abs(boxes[0].x - boxes[1].x) > 2 || boxes[1].y <= boxes[0].y)
      throw new Error('Narrow image diff did not stack');
    writeFileSync(resolve(out, 'narrow-layout.json'), JSON.stringify(boxes, null, 2));
  } else
    await page.waitForFunction(() =>
      document.querySelector('.bh-memory-commit-view')?.textContent.includes('binary'),
    );
  await capture('working-narrow');
  let exported = 0;
  const hashes = [];
  if (!before)
    for (const [ext, mime] of formats) {
      const path = `preview.${ext}`;
      const current = cli('memory-file', seed.slug, '--path', path).file.image;
      const changed = cli(
        'memory-working-diff',
        seed.slug,
        '--path',
        path,
        '--kind',
        'current',
      ).images;
      const history = cli('memory-commit-diff', seed.slug, '--sha', seed.commit).files.find(
        (file) => file.path === path,
      ).images;
      for (const [label, image] of [
        ['current', current],
        ['working-before', changed.before],
        ['working-after', changed.after],
        ['history-before', history.before],
        ['history-after', history.after],
      ]) {
        const output = resolve(out, `${label}.${ext}`);
        const receipt = cli(
          'memory-image',
          seed.slug,
          '--path',
          path,
          '--image-source',
          image.source,
          '--image-revision',
          image.revision,
          '--out',
          output,
        );
        const expected =
          image.source === 'worktree'
            ? readFileSync(resolve(seed.memory, path))
            : execFileSync('git', ['-C', seed.memory, 'show', `${image.source}:${path}`]);
        if (!readFileSync(output).equals(expected) || receipt.mime !== mime)
          throw new Error('Wrong version/MIME from CLI');
        exported++;
        hashes.push({
          format: ext,
          side: label,
          sha256: createHash('sha256').update(expected).digest('hex'),
        });
      }
      const doc = cli('memory-file', seed.slug, '--path', 'notes/formats.md').file.markdown;
      const output = resolve(out, `inline.${ext}`);
      cli(
        'memory-image',
        seed.slug,
        '--path',
        'notes/formats.md',
        '--image-source',
        doc.source,
        '--image-revision',
        doc.revision,
        '--image-reference',
        `../${path}`,
        '--out',
        output,
      );
      if (!readFileSync(output).equals(fixture('green', ext)))
        throw new Error('Wrong inline bytes');
      exported++;
    }
  if (!before)
    for (const [ext, mime] of formats) {
      const path = `preview.${ext}`;
      const git = (...args) => execFileSync('git', ['-C', seed.memory, ...args]);
      try {
        git('add', '--', path);
        writeFileSync(resolve(seed.memory, path), fixture('blue', ext));
        for (const kind of ['staged', 'unstaged']) {
          const diff = cli('memory-working-diff', seed.slug, '--path', path, '--kind', kind).images;
          for (const side of ['before', 'after']) {
            const image = diff[side];
            const output = resolve(out, `${kind}-${side}.${ext}`);
            const receipt = cli(
              'memory-image',
              seed.slug,
              '--path',
              path,
              '--image-source',
              image.source,
              '--image-revision',
              image.revision,
              '--out',
              output,
            );
            const expected =
              image.source === 'worktree'
                ? fixture('blue', ext)
                : git('show', `${image.source === 'index' ? '' : image.source}:${path}`);
            if (receipt.mime !== mime || !readFileSync(output).equals(expected))
              throw new Error('Wrong staged/unstaged export');
            exported++;
            hashes.push({
              format: ext,
              side: `${kind}-${side}`,
              sha256: createHash('sha256').update(expected).digest('hex'),
            });
          }
        }
      } finally {
        git('restore', '--staged', '--', path);
        writeFileSync(resolve(seed.memory, path), fixture('green', ext));
      }
    }
  if (forbiddenRequests.length || (await page.evaluate(() => window.svgExecuted === true)))
    throw new Error('SVG escaped image boundary');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  const report = {
    phase,
    source: identity.revision,
    clean: !identity.dirty,
    pixels,
    animations,
    exports: exported,
    hashes,
    unexpectedErrors: errors,
    expectedRefusals: expectedErrors.length,
    forbiddenSvgRequests: forbiddenRequests.length,
    nativeAcceptance: false,
  };
  writeFileSync(resolve(out, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ phase, source: identity.revision, exports: exported, evidence: out }),
  );
} catch (error) {
  await capture('failure').catch(() => undefined);
  writeFileSync(
    resolve(out, 'failure.json'),
    JSON.stringify({ stage, message: error.message, errors, forbiddenRequests }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
