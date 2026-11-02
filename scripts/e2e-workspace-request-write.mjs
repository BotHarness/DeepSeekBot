import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { resolve, parse, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rpc, verifyPaths, collectObservation } from './verify-app.mjs';
import { readClientDiagnostics } from './dev-client-diagnostics.mjs';

const root = resolve(import.meta.dirname, '..');
const flag = (name) => process.argv[process.argv.indexOf(name) + 1];
const name = process.argv.includes('--name') ? flag('--name') : 'ax2080-write';
const paths = verifyPaths(name, root);
const instance = JSON.parse(
  readFileSync(process.argv.includes('--instance') ? flag('--instance') : paths.instance, 'utf8'),
);
const baseline = process.argv.includes('--expect-read-only');
const legacy = process.argv.includes('--legacy');
const output = resolve(paths.dir, `workspace-write-${Date.now()}`);
mkdirSync(output, { recursive: true });
const resume = process.argv.includes('--resume-report')
  ? JSON.parse(readFileSync(flag('--resume-report'), 'utf8'))
  : undefined;
const fixture =
  resume?.fixture ?? realpathSync(mkdtempSync(resolve(tmpdir(), '.000-bh-2080-write-')));
const report = {
  version: 1,
  behavior: 'desktop.grants.request-write-continue',
  baseline,
  legacyGrantId: resume?.legacyGrantId,
  status: 'running',
  stage: 'setup',
  botId: '',
  botName: resume?.botName ?? 'AX Workspace 2080 ' + Date.now(),
  fixture,
  evidence: output,
  dirty:
    execFileSync('git', ['status', '--porcelain'], {
      cwd: instance.worktree,
      encoding: 'utf8',
    }).trim().length > 0,
  source: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: instance.worktree,
    encoding: 'utf8',
  }).trim(),
  console: [],
};
const safe = (text) =>
  String(text).replaceAll(
    new URL(instance.url).searchParams.get('token') ?? '<no-token>',
    '<redacted>',
  );
const save = (file, value) =>
  writeFileSync(
    resolve(output, file),
    typeof value === 'string' ? safe(value) : JSON.stringify(value, null, 2),
    { mode: 0o600 },
  );
const cli = (args, input) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        resolve(root, 'packages/deepseekbot/dist/deepseekbot.mjs'),
        ...args,
        '--compact',
        '--timeout',
        '60',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 90_000,
        input: input === undefined ? undefined : JSON.stringify(input),
        env: {
          ...process.env,
          DEEPSEEKBOT_HOST: new URL(instance.url).origin,
          DEEPSEEKBOT_HOST_TOKEN: new URL(instance.url).searchParams.get('token'),
        },
      },
    ),
  );
const messages = async () =>
  (
    await rpc(instance, 'botharness/channelMessages', {
      channelId: 'dm-' + report.botId,
      limit: 100,
    })
  ).messages;
const until = async (read, label, timeout = 180_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await new Promise((done) => setTimeout(done, 750));
  }
  throw new Error('Timed out: ' + label);
};
const send = (body) =>
  rpc(instance, 'botharness/channelSend', {
    channelId: 'dm-' + report.botId,
    body,
    messageId: 'human-' + randomUUID(),
  });
let browser, page;
const capture = async (label) => {
  await page.screenshot({ path: resolve(output, label + '.png') });
  save(label + '.aria.json', await page.accessibility.snapshot({ interestingOnly: false }));
  save(label + '.diagnostics.json', await readClientDiagnostics(instance));
  save('console.json', report.console);
};
const click = (label, role = 'button') =>
  page
    .locator(`::-p-aria([name=${JSON.stringify(label)}][role=${JSON.stringify(role)}])`)
    .setTimeout(20_000)
    .click();
const dismiss = async () => {
  for (let i = 0; i < 4; i++) {
    for (const label of ['Continue', 'Configure later', 'Skip tutorial']) {
      const button = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
      if (button && (await button.isVisible())) await button.click();
    }
    await new Promise((done) => setTimeout(done, 200));
  }
};
try {
  report.build = cli(['release-info']).identity;
  report.stage = 'create-bot';
  if (!resume) {
    const created = cli([
      'create',
      '--name',
      report.botName,
      '--persona',
      'Complete the Human file task using native write tools. This isolated QA Bot has synthetic data only.',
    ]);
    report.botId = created.bot?.id;
    if (!report.botId) throw new Error('Bot creation outcome unknown; do not retry creation');
    const marker = 'ax2080-' + Date.now();
    await send('Reply with exactly ' + marker + '-ready using bot_send_message.');
    await until(
      async () =>
        (await messages()).some(
          (message) => message.author.kind === 'bot' && message.body.includes(marker + '-ready'),
        ),
      'real-model-DM',
    );
    save('model-ready.json', { marker, observed: true });
  } else {
    report.botId = resume.botId;
    report.botName = resume.botName ?? 'AX Workspace 2080';
  }
  const marker =
    resume?.marker ??
    (resume
      ? JSON.parse(readFileSync(resolve(resume.evidence, 'model-ready.json'), 'utf8')).marker
      : JSON.parse(readFileSync(resolve(output, 'model-ready.json'), 'utf8')).marker);
  report.marker = marker;
  report.stage = 'request-workspace';
  const mainFile = resolve(fixture, 'orchestrator.txt');
  const assignmentFile = resolve(fixture, 'assignment.txt');
  if (!resume)
    await send(
      `QA task ${marker}: I want two files in ${fixture}. First call request_workspace_grant explaining that you need this folder to write both files, then end this turn and wait for the Human folder card approval. After approval, use the native write tool yourself to write ${mainFile} with exactly ${marker}-orchestrator. Then use create_assignment with the approved Grant for one Assignment to write ${assignmentFile} with exactly ${marker}-assignment using native write, report completed, and wait for its report. Reply with ${marker}-done through bot_send_message only after both succeed. Do not use Shell, another folder, or more approval cards after the directory is writable.`,
    );
  const request = await until(
    async () =>
      (await messages()).find(
        (message) => message.grantRequest && message.author.slug === report.botId,
      ),
    'grant-request',
  );
  report.requestId = request.id;
  if (legacy && !resume?.grant) {
    const workspace = cli(['workspace-create', fixture]);
    const prior = cli([
      'grant-create',
      report.botId,
      '--workspace',
      workspace.workspace.workspaceId,
    ]).grant;
    if (prior.orchestratorWrite !== false || prior.writeRevision !== 0)
      throw new Error('Legacy fixture must start read-only');
    report.legacyGrantId = prior.id;
    save('legacy-before.json', prior);
  }
  save('pending.json', { request, grants: cli(['grants', report.botId]) });
  const store = resolve(root, 'node_modules/.pnpm');
  const puppeteerPackage = readdirSync(store).find((entry) => entry.startsWith('puppeteer@'));
  const puppeteer = createRequire(resolve(store, puppeteerPackage, 'node_modules/'))('puppeteer');
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
  page = await browser.newPage();
  page.on('pageerror', (error) =>
    report.console.push({
      type: 'pageerror',
      message: safe(error.message),
      stack: safe(error.stack),
    }),
  );
  page.on('console', (event) => {
    if (event.type() === 'error')
      report.console.push({ type: 'console', message: safe(event.text()) });
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.setViewport({ width: 1440, height: 1100 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(instance.url, { waitUntil: 'networkidle2', timeout: 60_000 });
  await dismiss();
  const mode = await page.$('button[aria-label="Bot mode"]');
  if (mode && (await mode.isVisible())) await click('Bot mode');
  await page.waitForSelector('.bh-workspace-rail', { visible: true });
  await dismiss();
  const tree = await page.accessibility.snapshot({ interestingOnly: false });
  const find = (node) =>
    node.role === 'button' && node.name.startsWith(report.botName + ': ')
      ? node.name
      : node.children?.map(find).find(Boolean);
  const entry = find(tree);
  if (!entry) throw new Error('QA Bot sidebar entry unavailable');
  await click(entry);
  await dismiss();
  if (!(await page.$('.bh-grant-request-card'))) await click('Messages · Ctrl + Alt + Shift + 2');
  report.stage = 'Web-approval';
  if (!resume?.grant) {
    await capture('request-before');
    await click(baseline ? 'Choose folder and authorize' : 'Allow folder read/write');
    await page.waitForSelector('[data-folder-browser]', { visible: true });
    const hidden = await page.$('::-p-aria([name="Show hidden folders"])');
    if (hidden) await hidden.click();
    const crumbs = await page.$$('[data-folder-browser-crumb]');
    if (!crumbs.length) throw new Error('Folder root breadcrumb unavailable');
    await crumbs[0].click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-folder-browser-crumb]').length === 1,
    );
    const segments = relative(parse(fixture).root, fixture).split(sep);
    for (const segment of segments) {
      report.step = 'navigate-' + segment;
      await page
        .locator(
          `::-p-xpath(//button[@data-folder-browser-item and normalize-space(.)=${JSON.stringify(segment)}])`,
        )
        .setTimeout(20_000)
        .click();
      await page.waitForFunction(
        (name) =>
          document
            .querySelector('[data-folder-browser-crumb][aria-current="location"]')
            ?.textContent.trim() === name,
        {},
        segment,
      );
    }
    await capture('directory-confirmation');
    await click('Authorize workspace');
  }
  const grant = await until(
    () =>
      cli(['grants', report.botId]).grants?.find(
        (row) => row.workspacePath === fixture && !row.revokedAt,
      ),
    'persisted-grant',
  );
  report.grant = grant;
  save('granted.json', grant);
  await capture('authorized-after');
  if (baseline) {
    if (grant.orchestratorWrite !== false || grant.writeRevision !== 0)
      throw new Error('Baseline did not reproduce read-only authority');
    report.status = 'baseline-reproduced';
  } else {
    if (grant.orchestratorWrite !== true || grant.writeRevision !== 1)
      throw new Error('Grant was not persistently writable');
    report.stage = 'native-writes-and-continuation';
    await until(
      () => existsSync(mainFile) && existsSync(assignmentFile),
      'both native write results',
      240_000,
    );
    if (
      readFileSync(mainFile, 'utf8').trim() !== marker + '-orchestrator' ||
      readFileSync(assignmentFile, 'utf8').trim() !== marker + '-assignment'
    )
      throw new Error('Native file contents differ');
    await until(
      async () =>
        (await messages()).some(
          (message) => message.author.kind === 'bot' && message.body.includes(marker + '-done'),
        ),
      'same-task final reply',
    );
    save('files.json', {
      orchestrator: readFileSync(mainFile, 'utf8'),
      assignment: readFileSync(assignmentFile, 'utf8'),
    });
    save('trace.json', cli(['bot-trace', report.botId, '--turns', '6']));
    const sessions = cli(['bot-sessions', report.botId]);
    save('sessions.json', sessions);
    const assignment = sessions.sessions.find((session) => session.role === 'assignment');
    if (assignment?.assignmentReportState !== 'completed')
      throw new Error('Assignment did not report completed');
    save(
      'assignment-trace.json',
      cli(['bot-trace', report.botId, '--session', assignment.sessionId]),
    );
    const attention = await until(() => {
      const snapshot = cli(['bot-attention', report.botId, '--limit', '100']);
      const original = snapshot.items.find((item) =>
        item.summary?.startsWith('QA task ' + marker + ':'),
      );
      const decision = snapshot.items.find(
        (item) => item.sourceMessageId === 'grant-resolution-' + request.id,
      );
      return original?.state === 'handled' && decision?.state === 'handled' ? snapshot : undefined;
    }, 'original task and authorization decision handled');
    save('attention.json', attention);
    const repeated = cli([
      'grant-request-approve',
      report.botId,
      '--channel',
      'dm-' + report.botId,
      '--request',
      request.id,
      '--workspace',
      grant.workspaceId,
      '--confirm',
    ]);
    save('duplicate.json', repeated);
    if (repeated.grant.id !== grant.id || repeated.grant.writeRevision !== 1)
      throw new Error('Duplicate changed authority');
    if (legacy && grant.id !== report.legacyGrantId)
      throw new Error('Legacy upgrade replaced the Grant');
    if (
      cli(['bot-attention', report.botId, '--limit', '100']).items.length !== attention.items.length
    )
      throw new Error('Duplicate admitted another continuation');
    if (cli(['grants', report.botId]).grants.filter((row) => !row.revokedAt).length !== 1)
      throw new Error('Duplicate approval created another Grant');
    await capture('completed-after');
    report.status = 'pass';
  }
} catch (error) {
  report.status = 'fail';
  report.error = safe(error.message);
  if (page) await capture('failure').catch(() => {});
  save(
    'observation.json',
    await collectObservation({
      health: async () => {
        await rpc(instance, 'botharness/list');
        return { ok: true, authenticatedApi: true };
      },
      diagnostics: () => readClientDiagnostics(instance),
    }).catch((cause) => ({ error: safe(cause.message) })),
  );
  process.exitCode = 1;
} finally {
  save('report.json', report);
  await browser?.close();
  console.log(
    JSON.stringify({
      status: report.status,
      stage: report.stage,
      error: report.error,
      botId: report.botId,
      evidence: output,
    }),
  );
}
