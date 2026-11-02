import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Use --name <task-owned verify-app instance>');
const phase = process.argv.includes('--before') ? 'before' : 'after';
const task = resolve('.humanlayer/verify', name, 'memory-markdown');
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
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const hostSource = phase === 'after' ? cli('release-info').identity?.source : undefined;
if (phase === 'after' && (hostSource?.revision !== sourceSha || hostSource?.dirty !== false))
  throw new Error('Rebuild and restart the task Host from this clean commit before verification');
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
  const existing = rpc('list').bots.find((b) => b.displayName === 'Markdown Preview QA');
  const created = existing
    ? {
        bot: { id: existing.slug, name: existing.displayName },
        dm: { channelId: rpc('channelDm', { slug: existing.slug }).channel.id },
      }
    : cli(
        'create',
        '--name',
        'Markdown Preview QA',
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
  mkdirSync(resolve(memory, 'notes'), { recursive: true });
  const body = (version) =>
    `# Field guide — ${version}\n\nA **readable document** with the image from this version.\n\n| Check | Result |\n| --- | --- |\n| Version | ${version} |\n| Source | Memory Repository |\n\n![Version chart](../preview.png)\n\n## External reference\n\n![Remote figure](https://preview.invalid/external.png)\n\n## More figures\n\n![Repository root](/preview.png)\n\n![Missing figure](../missing.png)\n\n<script>window.markdownExecuted = true</script>\n`;
  const commitAll = (label) => {
    git('add', 'preview.png', 'notes/guide.md');
    git(
      '-c',
      'user.name=Markdown QA',
      '-c',
      'user.email=qa@example.invalid',
      'commit',
      '-m',
      label,
    );
    return git('rev-parse', 'HEAD');
  };
  writeFileSync(resolve(memory, 'preview.png'), png('VERSION ONE', '#254ca0'));
  writeFileSync(resolve(memory, 'notes/guide.md'), body('VERSION ONE'));
  const first = commitAll('Illustrated note one');
  writeFileSync(resolve(memory, 'preview.png'), png('VERSION TWO', '#a85016'));
  writeFileSync(resolve(memory, 'notes/guide.md'), body('VERSION TWO'));
  const commit = commitAll('Illustrated note two');
  writeFileSync(resolve(memory, 'preview.png'), png('CURRENT FILE', '#196f48'));
  writeFileSync(resolve(memory, 'notes/guide.md'), body('CURRENT FILE'));
  seed = { slug, name: created.bot.name, channelId: created.dm.channelId, memory, commit, first };
  writeFileSync(seedPath, JSON.stringify(seed, null, 2));
}
const pnpm = resolve('node_modules/.pnpm');
const pkg = readdirSync(pnpm).find((n) => n.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const errors = [];
const expectedRefusals = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => {
  if (message.type() === 'error') {
    if (
      message.location().url?.includes('/memory/image?') &&
      new URL(message.location().url).searchParams.get('reference') === '../missing.png' &&
      message.text().includes('404')
    )
      expectedRefusals.push('missing-image:404');
    else errors.push(message.text().slice(0, 1000));
  }
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
const imageRequests = [];
const externalRequests = [];
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (request.url().startsWith('https://preview.invalid/')) {
    externalRequests.push(request.url());
    void request.respond({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(resolve(seed.memory, 'preview.png')),
    });
  } else {
    if (request.url().includes('/memory/image?')) imageRequests.push(request.url());
    void request.continue();
  }
});
const selectWorking = async () => {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.bh-memory-working-list .bh-memory-row')].some((e) =>
      e.textContent.includes('notes/guide.md'),
    ),
  );
  const rows = await page.$$('.bh-memory-working-list .bh-memory-row');
  for (const row of rows)
    if ((await row.evaluate((e) => e.textContent)).includes('notes/guide.md')) {
      await row.click();
      return;
    }
  throw new Error('Markdown working row missing');
};
const decoded = async (count = 1) =>
  page.waitForFunction(
    (n) =>
      [...document.querySelectorAll('.bh-memory-markdown img')].filter(
        (img) => img.alt === 'Version chart' && img.naturalWidth === 640 && img.checkVisibility(),
      ).length === n,
    {},
    count,
  );
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(instance.url, { waitUntil: 'networkidle2', timeout: 30000 });
  await dismiss();
  await click('Bot mode');
  await page.waitForSelector('.bh-root.bh-main', { visible: true });
  await dismiss();
  await click('Markdown Preview QA: Idle Markdown Preview QA No messages yet');
  if (await page.$('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]'))
    await click('Messages · ⌥ ⇧ ⌘ 2');
  await dismiss();
  for (const name of ['Close Home', 'Close Sessions']) {
    const el = await page.$(`::-p-aria([name=${JSON.stringify(name)}][role="button"])`);
    if (el && (await el.isVisible())) await el.click();
  }
  stage = 'current';
  await click('Memory files');
  await page.locator('::-p-aria([name="notes"][role="treeitem"])').click();
  await page.locator('::-p-aria([name="guide.md"][role="treeitem"])').click();
  await page.waitForSelector('.bh-memory-commit-view');
  await click('Close Memory files');
  if (phase === 'after') await decoded();
  else await page.waitForSelector('.bh-memory-commit-code');
  await capture('current-light');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await capture('current-dark');
  if (phase === 'after') {
    if (externalRequests.length !== 0) throw new Error('External image loaded without consent');
    if (await page.evaluate(() => window.markdownExecuted === true))
      throw new Error('Markdown executed HTML');
    await click('View source');
    await page.waitForSelector('.bh-memory-commit-code');
    await capture('source-dark');
    await click('Rendered preview');
    await decoded();
    await click('View image Version chart');
    await page.waitForSelector('[role="dialog"] img');
    await capture('enlarged');
    await page.keyboard.press('Escape');
    const external = page.locator(
      '::-p-aria([name="Load external image: Remote figure"][role="button"])',
    );
    await external.click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-memory-markdown img')].some(
        (i) => i.alt === 'Remote figure' && i.naturalWidth === 640,
      ),
    );
    if (externalRequests.length !== 1) throw new Error('Explicit external load not observed');
    await capture('external-loaded');
    await page.evaluate(() =>
      [...document.querySelectorAll('.bh-memory-markdown span')]
        .find((e) => e.textContent.includes('Missing figure'))
        ?.scrollIntoView({ block: 'center' }),
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-memory-markdown [role="status"]')].some((e) =>
        e.textContent.includes('Image is missing'),
      ),
    );
    await capture('missing-image');
  }
  stage = 'working';
  await click('Memory evolution');
  await selectWorking();
  await click('Close Memory evolution');
  await page.waitForSelector('.bh-memory-diff-file');
  if (phase === 'after') {
    if (await page.$('.bh-memory-markdown')) throw new Error('Diff must default to lines');
    await capture('working-lines');
    await click('Rendered preview');
    await decoded(2);
  }
  await capture('working-dark');
  stage = 'history';
  await click('Memory evolution');
  await page.locator(`button[title="${seed.commit}"]`).click();
  await click('Close Memory evolution');
  if (phase === 'after') {
    await click('Rendered preview');
    await decoded(2);
  } else await page.waitForSelector('.bh-memory-diff-table');
  await capture('history-dark');
  stage = 'narrow';
  await page.setViewport({ width: 700, height: 1000 });
  await page.waitForSelector('.bh-mobile-shell[data-page="list"]', { visible: true });
  await page.locator(`.bh-mobile-list button[data-channel-id="${seed.channelId}"]`).click();
  await page.waitForSelector('.bh-mobile-shell[data-page="conversation"]', { visible: true });
  await click('Conversation settings');
  await click('Memory');
  await selectWorking();
  await page.keyboard.press('Escape');
  if (phase === 'after') {
    await click('Rendered preview');
    await decoded();
    await page.evaluate(() =>
      document
        .querySelectorAll('.bh-memory-diff-file figure')[1]
        ?.scrollIntoView({ block: 'start' }),
    );
    await decoded(2);
    await capture('working-narrow-after');
    await page.$eval('.bh-memory-commit-view', (node) => {
      node.scrollTop = 0;
    });
    await page.waitForFunction(
      () => document.querySelector('.bh-memory-commit-view')?.scrollTop === 0,
    );
    const boxes = await page.$$eval('.bh-memory-diff-file figure', (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    if (boxes.length !== 2 || Math.abs(boxes[0].x - boxes[1].x) > 2 || boxes[1].y <= boxes[0].y)
      throw new Error('Narrow Markdown comparison does not stack');
    writeFileSync(resolve(out, 'narrow-layout.json'), JSON.stringify(boxes, null, 2));
  }
  if (phase === 'before') await page.waitForSelector('.bh-memory-diff-table');
  await capture('working-narrow');
  stage = 'CLI';
  let exports = 0;
  if (phase === 'after') {
    const path = 'notes/guide.md';
    const current = cli('memory-file', seed.slug, '--path', path).file.markdown;
    const working = cli(
      'memory-working-diff',
      seed.slug,
      '--path',
      path,
      '--kind',
      'current',
    ).markdown;
    const history = cli('memory-commit-diff', seed.slug, '--sha', seed.commit).files.find(
      (f) => f.path === path,
    ).markdown;
    const bytes = (source) =>
      source === 'worktree'
        ? readFileSync(resolve(seed.memory, 'preview.png'))
        : execFileSync('git', [
            '-C',
            seed.memory,
            'show',
            `${source === 'index' ? '' : source}:preview.png`,
          ]);
    const check = (label, doc, reference = '../preview.png') => {
      const output = resolve(out, label + '-export.png');
      const result = cli(
        'memory-image',
        seed.slug,
        '--path',
        path,
        '--image-source',
        doc.source,
        '--image-revision',
        doc.revision,
        '--image-reference',
        reference,
        '--out',
        output,
      );
      if (!readFileSync(output).equals(bytes(doc.source)) || result.reference !== reference)
        throw new Error('CLI bytes do not match document version: ' + label);
      exports++;
    };
    check('current', current);
    check('working-before', working.before);
    check('working-after', working.after);
    check('history-before', history.before);
    check('history-after', history.after, '/preview.png');
    const original = readFileSync(resolve(seed.memory, path));
    const originalImage = readFileSync(resolve(seed.memory, 'preview.png'));
    const git = (...args) =>
      execFileSync('git', ['-C', seed.memory, ...args], { encoding: 'utf8' }).trim();
    try {
      writeFileSync(resolve(seed.memory, path), '# STAGED\n![Version chart](../preview.png)');
      writeFileSync(
        resolve(seed.memory, 'preview.png'),
        execFileSync('git', ['-C', seed.memory, 'show', seed.first + ':preview.png']),
      );
      git('add', path, 'preview.png');
      writeFileSync(resolve(seed.memory, path), original);
      writeFileSync(resolve(seed.memory, 'preview.png'), originalImage);
      const staged = cli(
        'memory-working-diff',
        seed.slug,
        '--path',
        path,
        '--kind',
        'staged',
      ).markdown;
      const unstaged = cli(
        'memory-working-diff',
        seed.slug,
        '--path',
        path,
        '--kind',
        'unstaged',
      ).markdown;
      check('staged-before', staged.before);
      check('staged-after', staged.after);
      check('unstaged-before', unstaged.before);
      check('unstaged-after', unstaged.after);
      writeFileSync(resolve(seed.memory, path), '# changed after selection');
      const refused = spawnSync(
        process.execPath,
        [
          'packages/deepseekbot/dist/deepseekbot.mjs',
          'memory-image',
          seed.slug,
          '--path',
          path,
          '--image-source',
          current.source,
          '--image-revision',
          current.revision,
          '--image-reference',
          '../preview.png',
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
        !refused.stdout.includes('memory-image-stale') ||
        existsSync(resolve(out, 'must-not-exist.png'))
      )
        throw new Error('Stale Markdown was not refused');
    } finally {
      git('reset', 'HEAD', '--', path, 'preview.png');
      writeFileSync(resolve(seed.memory, path), original);
      writeFileSync(resolve(seed.memory, 'preview.png'), originalImage);
    }
    const anonymous = await fetch(
      login.origin +
        '/api/botharness/memory/image?' +
        new URLSearchParams({
          slug: seed.slug,
          path,
          source: current.source,
          revision: current.revision,
          reference: '../preview.png',
        }),
    );
    if (anonymous.status !== 401) throw new Error('Anonymous Markdown image access not refused');
  }
  const summary = {
    ok: true,
    phase,
    hostSource,
    source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    browser: await browser.version(),
    exports,
    externalRequests: externalRequests.length,
    imageRequests: imageRequests.length,
    pageErrors: errors,
    expectedRefusals,
    screenshots: readdirSync(out).filter((p) => p.endsWith('.png') && !p.endsWith('-export.png')),
  };
  if (errors.length) throw new Error('Browser console/page errors: ' + JSON.stringify(errors));
  writeFileSync(resolve(out, 'verification.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, evidence: out }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(
    resolve(out, 'failure-aria.json'),
    JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }), null, 2),
  );
  writeFileSync(
    resolve(out, 'failure.json'),
    JSON.stringify({ stage, error: String(error), errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
