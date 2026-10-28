import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Use --name <task-owned verify-app instance>');
const phase = process.argv.includes('--before') ? 'before' : 'after';
const task = resolve('.humanlayer/verify', name, 'memory-images');
mkdirSync(task, { recursive: true });
const instance = JSON.parse(readFileSync(resolve('.humanlayer/verify', name, 'instance.json')));
if (instance.worktree !== root) throw new Error('Use an isolated Host from this worktree');
const doctor = spawnSync(process.execPath, ['scripts/verify-app.mjs', 'doctor', '--name', name], {
  encoding: 'utf8',
});
if (doctor.status !== 0 || !JSON.parse(doctor.stdout).ok)
  throw new Error('Isolated Host doctor failed');
const login = new URL(instance.url);
const cli = (...args) => {
  const r = spawnSync(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', ...args, '--compact'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        DEEPSEEKBOT_HOST: login.origin,
        DEEPSEEKBOT_HOST_TOKEN: login.searchParams.get('token'),
      },
    },
  );
  if (r.status !== 0) throw new Error(`CLI ${args[0]} failed: ${r.stdout}`);
  return JSON.parse(r.stdout);
};
const seedPath = resolve(task, 'fixture.json');
let seed;
if (existsSync(seedPath)) seed = JSON.parse(readFileSync(seedPath));
else {
  const rpc = (method, args = {}) => {
    const r = spawnSync(
      process.execPath,
      [
        'scripts/verify-app.mjs',
        'rpc',
        'botharness/' + method,
        JSON.stringify(args),
        '--name',
        name,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error('fixture RPC refused');
    return JSON.parse(r.stdout);
  };
  const existing = rpc('list').bots.find((b) => b.displayName === 'Image Preview QA');
  const created = existing
    ? {
        bot: { id: existing.slug, name: existing.displayName },
        dm: { channelId: rpc('channelDm', { slug: existing.slug }).channel.id },
      }
    : cli(
        'create',
        '--name',
        'Image Preview QA',
        '--persona',
        'Synthetic image preview test. No model calls.',
      );
  const slug = created.bot.id;
  const get = rpc('get', { slug });
  const memory = get.bot.memoryDir;
  const { Resvg } = createRequire(resolve('packages/core/package.json'))('@resvg/resvg-js');
  const png = (label, color) =>
    Buffer.from(
      new Resvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${color}"/><text x="40" y="180" font-size="40" fill="white">${label}</text></svg>`,
      )
        .render()
        .asPng(),
    );
  const git = (...args) =>
    execFileSync('git', ['-C', memory, ...args], { encoding: 'utf8' }).trim();
  writeFileSync(resolve(memory, 'preview.png'), png('VERSION ONE', '#254ca0'));
  git('add', 'preview.png');
  git(
    '-c',
    'user.name=Image QA',
    '-c',
    'user.email=qa@example.invalid',
    'commit',
    '-m',
    'Image version one',
  );
  writeFileSync(resolve(memory, 'preview.png'), png('VERSION TWO', '#a85016'));
  git('add', 'preview.png');
  git(
    '-c',
    'user.name=Image QA',
    '-c',
    'user.email=qa@example.invalid',
    'commit',
    '-m',
    'Image version two',
  );
  const commit = git('rev-parse', 'HEAD');
  writeFileSync(resolve(memory, 'preview.png'), png('CURRENT FILE', '#196f48'));
  seed = { slug, name: created.bot.name, channelId: created.dm.channelId, memory, commit };
  writeFileSync(seedPath, JSON.stringify(seed, null, 2));
}
const pnpm = resolve('node_modules/.pnpm');
const pkg = readdirSync(pnpm).find((n) => n.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 1000));
});
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setUserAgentOverride', {
  userAgent: await browser.userAgent(),
  acceptLanguage: 'en-US,en',
});
const out = resolve(task, phase, 'attempt-' + Date.now());
mkdirSync(out, { recursive: true });
const click = async (name) =>
  page
    .locator(`::-p-aria([name=${JSON.stringify(name)}][role="button"])`)
    .setTimeout(12000)
    .click();
const dismiss = async () => {
  for (let i = 0; i < 5; i++) {
    for (const name of ['Continue', 'Configure later', 'Skip tutorial']) {
      const el = await page.$(`::-p-aria([name=${JSON.stringify(name)}][role="button"])`);
      if (el && (await el.isVisible())) await el.click();
    }
    await new Promise((r) => setTimeout(r, 200));
  }
};
const capture = async (label) => {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: resolve(out, label + '.png') });
  writeFileSync(
    resolve(out, label + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }), null, 2),
  );
};
let stage = 'open';
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(instance.url, { waitUntil: 'networkidle2', timeout: 30000 });
  await dismiss();
  await click('Bot mode');
  await page.waitForSelector('.bh-root.bh-main', { visible: true });
  await dismiss();
  await click('Image Preview QA: Idle Image Preview QA No messages yet');
  if (await page.$('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]'))
    await click('Messages · ⌥ ⇧ ⌘ 2');
  await dismiss();
  for (const name of ['Close Home', 'Close Sessions']) {
    const el = await page.$(`::-p-aria([name=${JSON.stringify(name)}][role="button"])`);
    if (el && (await el.isVisible())) await el.click();
  }
  stage = 'Memory files';
  await click('Memory files');
  await page.locator('::-p-aria([name="preview.png"][role="treeitem"])').click();
  await page.waitForSelector('.bh-memory-commit-view');
  await click('Close Memory files');
  if (phase === 'after')
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-memory-commit-view img')].some(
        (img) => img.naturalWidth === 640,
      ),
    );
  else
    await page.waitForFunction(() =>
      document.querySelector('.bh-memory-commit-view')?.textContent.includes('binary'),
    );
  await capture('current-light');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await capture('current-dark');
  stage = 'Memory evolution';
  await click('Memory evolution');
  const rows = await page.$$eval('.bh-memory-working-list button', (els) =>
    els.map((e) => ({ text: e.textContent, label: e.getAttribute('aria-label') })),
  );
  writeFileSync(resolve(out, 'working-buttons.json'), JSON.stringify(rows, null, 2));
  const row = page.locator('.bh-memory-working-list .bh-memory-row');
  await row.click();
  await click('Close Memory evolution');
  if (phase === 'after')
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.bh-memory-commit-view img').length === 2 &&
        [...document.querySelectorAll('.bh-memory-commit-view img')].every(
          (i) => i.naturalWidth === 640,
        ),
    );
  else
    await page.waitForFunction(() =>
      document.querySelector('.bh-memory-commit-view')?.textContent.includes('binary'),
    );
  await capture('working-dark');
  await page.setViewport({ width: 700, height: 1000 });
  await page.waitForSelector('.bh-mobile-shell[data-page="list"]', { visible: true });
  await page.locator(`.bh-mobile-list button[data-channel-id="${seed.channelId}"]`).click();
  await page.waitForSelector('.bh-mobile-shell[data-page="conversation"]', { visible: true });
  await click('Conversation settings');
  await click('Memory');
  await page.locator('.bh-memory-working-list .bh-memory-row').click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() =>
    document.querySelector('.bh-mobile-content .bh-memory-commit-view')?.checkVisibility(),
  );
  if (phase === 'after') {
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.bh-memory-commit-view figure img')];
      return (
        images.length === 2 &&
        images.every((img) => img.naturalWidth === 640 && img.checkVisibility())
      );
    });
    const boxes = await page.$$eval('.bh-memory-commit-view figure', (elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    if (boxes.length !== 2 || Math.abs(boxes[0].x - boxes[1].x) > 2 || boxes[1].y <= boxes[0].y)
      throw new Error('Narrow image comparison is not stacked');
    writeFileSync(resolve(out, 'narrow-layout.json'), JSON.stringify(boxes, null, 2));
  }
  await capture('working-narrow');
  await page.setViewport({ width: 1440, height: 1000 });
  await click('Memory evolution');
  await page.locator(`button[title="${seed.commit}"]`).click();
  await click('Close Memory evolution');
  if (phase === 'after')
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.bh-memory-commit-view img').length === 2 &&
        [...document.querySelectorAll('.bh-memory-commit-view img')].every(
          (i) => i.naturalWidth === 640,
        ),
    );
  else
    await page.waitForFunction(() =>
      document.querySelector('.bh-memory-commit-view')?.textContent.includes('binary'),
    );
  await capture('history-dark');
  if (phase === 'after') {
    const current = cli('memory-file', seed.slug, '--path', 'preview.png').file.image;
    const working = cli(
      'memory-working-diff',
      seed.slug,
      '--path',
      'preview.png',
      '--kind',
      'current',
    ).images;
    const history = cli('memory-commit-diff', seed.slug, '--sha', seed.commit).files.find(
      (f) => f.path === 'preview.png',
    ).images;
    const original = readFileSync(resolve(seed.memory, 'preview.png'));
    const gitBytes = (source) =>
      execFileSync('git', ['-C', seed.memory, 'show', `${source}:preview.png`]);
    const cases = [
      ['current', current, original],
      ['working-before', working.before, gitBytes(working.before.source)],
      ['working-after', working.after, original],
      ['history-before', history.before, gitBytes(history.before.source)],
      ['history-after', history.after, gitBytes(history.after.source)],
    ];
    for (const [label, image, expected] of cases) {
      const output = resolve(out, label + '-export.png');
      const result = cli(
        'memory-image',
        seed.slug,
        '--path',
        'preview.png',
        '--image-source',
        image.source,
        '--image-revision',
        image.revision,
        '--out',
        output,
      );
      if (result.bytes !== expected.length || !readFileSync(output).equals(expected))
        throw new Error('CLI image bytes differ: ' + label);
    }
    const git = (...args) =>
      execFileSync('git', ['-C', seed.memory, ...args], { encoding: 'utf8' }).trim();
    const originalIndex = git('rev-parse', ':preview.png');
    const stagedBlob = git('rev-parse', `${history.before.source}:preview.png`);
    try {
      git('update-index', '--cacheinfo', '100644', stagedBlob, 'preview.png');
      const staged = cli(
        'memory-working-diff',
        seed.slug,
        '--path',
        'preview.png',
        '--kind',
        'staged',
      ).images;
      const unstaged = cli(
        'memory-working-diff',
        seed.slug,
        '--path',
        'preview.png',
        '--kind',
        'unstaged',
      ).images;
      const extra = [
        ['staged-before', staged.before, gitBytes(seed.commit)],
        ['staged-after', staged.after, gitBytes(history.before.source)],
        ['unstaged-before', unstaged.before, gitBytes(history.before.source)],
        ['unstaged-after', unstaged.after, original],
      ];
      for (const [label, image, expected] of extra) {
        const output = resolve(out, label + '-export.png');
        cli(
          'memory-image',
          seed.slug,
          '--path',
          'preview.png',
          '--image-source',
          image.source,
          '--image-revision',
          image.revision,
          '--out',
          output,
        );
        if (!readFileSync(output).equals(expected))
          throw new Error('CLI phase bytes differ: ' + label);
      }
      cases.push(...extra);
      writeFileSync(resolve(seed.memory, 'preview.png'), gitBytes(history.before.source));
      const refused = spawnSync(
        process.execPath,
        [
          'packages/deepseekbot/dist/deepseekbot.mjs',
          'memory-image',
          seed.slug,
          '--path',
          'preview.png',
          '--image-source',
          current.source,
          '--image-revision',
          current.revision,
          '--out',
          resolve(out, 'must-not-exist.png'),
          '--compact',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            DEEPSEEKBOT_HOST: login.origin,
            DEEPSEEKBOT_HOST_TOKEN: login.searchParams.get('token'),
          },
        },
      );
      if (
        refused.status === 0 ||
        JSON.parse(refused.stdout).error?.code !== 'memory-image-stale' ||
        existsSync(resolve(out, 'must-not-exist.png'))
      )
        throw new Error('Stale CLI image was not refused');
    } finally {
      writeFileSync(resolve(seed.memory, 'preview.png'), original);
      git('update-index', '--cacheinfo', '100644', originalIndex, 'preview.png');
    }
    const denied = await fetch(
      new URL(
        '/api/botharness/memory/image?' +
          new URLSearchParams({
            slug: seed.slug,
            path: 'preview.png',
            source: current.source,
            revision: current.revision,
          }),
        login,
      ),
    );
    if (![401, 403].includes(denied.status))
      throw new Error('Image route accepted unauthenticated read');
    await denied.body?.cancel();
    const enlarged = await page.$('button[aria-label="View image preview.png"]');
    if (!enlarged) throw new Error('Image enlargement action missing');
    {
      await enlarged.click();
      await page.waitForSelector('[role="dialog"] img');
      await page.waitForFunction(
        () => document.querySelector('[role="dialog"] img')?.naturalWidth === 640,
      );
      await capture('enlarged');
      await page.keyboard.press('Escape');
    }
    const evidence = {
      result: 'pass',
      metadataAndByteExports: cases.map(([label, image]) => ({
        label,
        source: image.source,
        revision: image.revision,
      })),
      staleContentRefusal: 'memory-image-stale',
      unauthenticatedStatus: denied.status,
      browser: await browser.version(),
      pageErrors: errors,
    };
    writeFileSync(resolve(out, 'verification.json'), JSON.stringify(evidence, null, 2));
  }
  if (errors.length) throw new Error('page errors: ' + errors.join(';'));
  writeFileSync(
    resolve(task, phase + '-result.json'),
    JSON.stringify({
      phase,
      result: 'pass',
      screenshots: phase === 'after' ? 6 : 5,
      consoleErrors: errors.length,
      out,
    }),
  );
  console.log(
    JSON.stringify({
      phase,
      result: 'pass',
      screenshots: phase === 'after' ? 6 : 5,
      consoleErrors: errors.length,
    }),
  );
} catch (e) {
  await capture('failure');
  writeFileSync(resolve(out, 'page-errors.json'), JSON.stringify(errors, null, 2));
  writeFileSync(
    resolve(out, 'failure-buttons.json'),
    JSON.stringify(
      await page.$$eval('button', (nodes) =>
        nodes
          .filter((n) => n.checkVisibility())
          .map((n) => ({
            name: n.getAttribute('aria-label'),
            cls: n.className,
            text: n.textContent,
          })),
      ),
      null,
      2,
    ),
  );
  console.error(
    stage +
      ': ' +
      String(e.message)
        .replaceAll(instance.url, '[login]')
        .replaceAll(instance.home, '[profile]')
        .replaceAll(root, '[worktree]'),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
