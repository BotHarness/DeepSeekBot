import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const userHome = process.env.USERPROFILE ?? homedir();
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_ACTION_QA_PORT ?? 31999);
const home = resolve(
  process.env.BH_ACTION_QA_HOME ?? resolve(tmpdir(), 'bh-552-inbox-grant-assignment'),
);
const out = resolve(repo, '.humanlayer/tasks/issue-552', mode === 'before' ? 'before' : 'evidence');
mkdirSync(out, { recursive: true });
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated DSH Profile first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const shot = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const theme = async (dark) => {
  await page.evaluate(async (dark) => {
    if (dark) document.body.setAttribute('data-ds-dark-theme', 'true');
    else document.body.removeAttribute('data-ds-dark-theme');
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, dark);
};
const rpc = async (method, args = {}, client = page, namespace = 'botharness') =>
  client.evaluate(
    async ({ method, args, namespace }) => {
      const response = await fetch('/api/' + namespace + '/' + method, {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: namespace + '/' + method,
          payload: { args },
        }),
      });
      const result = (await response.json()).result;
      if (result?.ok !== true) throw new Error(method + ': ' + JSON.stringify(result?.error));
      return result.value;
    },
    { method, args, namespace },
  );
const click = async (selector, text, client = page) => {
  await client.waitForFunction(
    ({ selector, text }) =>
      [...document.querySelectorAll(selector)].some(
        (n) => n.textContent?.trim() === text && n.disabled !== true,
      ),
    {},
    { selector, text },
  );
  assert.ok(
    await client.evaluate(
      ({ selector, text }) => {
        const n = [...document.querySelectorAll(selector)].find(
          (n) => n.textContent?.trim() === text && n.disabled !== true,
        );
        n?.click();
        return !!n;
      },
      { selector, text },
    ),
  );
};
const login = async (client) => {
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((n) =>
          ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''),
        ),
      { timeout: 6000 },
    )
    .catch(() => undefined);
  await client.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((n) => ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''))
      ?.click(),
  );
  await client.waitForSelector('.bh-human-inbox-entry', { timeout: 5000 }).catch(async () => {
    await client.waitForFunction(() =>
      [...document.querySelectorAll('button')].some((node) =>
        node.textContent?.includes('Bot 模式'),
      ),
    );
    await client.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await client.waitForSelector('.bh-human-inbox-entry');
  });
};
const inbox = async (client = page) => {
  await client.bringToFront();
  await client.evaluate(() => document.querySelector('.bh-human-inbox-entry')?.click());
  await client.waitForSelector('.bh-human-inbox-tabs');
  await click('.bh-human-inbox-tabs button', '需要我处理', client);
  await delay(700);
};
const openDM = async (id, client = page) => {
  await client.bringToFront();
  await client.waitForSelector(`[data-channel-id="${id}"]`);
  await client.evaluate((id) => document.querySelector(`[data-channel-id="${id}"]`)?.click(), id);
  await client.waitForSelector('.bh-channel-options');
  await delay(700);
};
const waitFor = async (test, label) => {
  for (let n = 0; n < 60; n++) {
    const result = await test();
    if (result) return result;
    await delay(2000);
  }
  throw new Error('Timed out: ' + label);
};
const actionRows = async () =>
  (await rpc('humanAttention', { category: 'action', sort: 'oldest' })).items;
const send = (dm, body) =>
  rpc('channelSend', { channelId: dm.id, body, messageId: 'human-' + crypto.randomUUID() });
const newBot = async (name) => {
  const bot = (
    await rpc('create', {
      displayName: name,
      persona:
        'Follow the Human precisely. Workspace access must be requested using request_workspace_grant. Never answer Assignment questions yourself: wait until the actual Human sends the release route in your DM. On that Human response, inspect the addressed Assignment and relay the answer via send_assignment_request using the current open ask Source Event ID. Never create native user questions. Never invent a release route. Use channel_send for brief DM status.',
    })
  ).bot;
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  return { bot, dm };
};
const review = async (scene, label, client = page) => {
  await inbox(client);
  await client.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.bh-human-inbox-row')].some((row) =>
        row.textContent?.includes(name),
      ),
    {},
    scene.bot.displayName,
  );
  await client.evaluate(
    ({ name, label }) => {
      const row = [...document.querySelectorAll('.bh-human-inbox-row')].find((row) =>
        row.textContent?.includes(name),
      );
      [...row.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === label)
        ?.click();
    },
    { name: scene.bot.displayName, label },
  );
  await client.waitForSelector('.bh-human-inbox-reply');
};
try {
  await login(page);
  if (mode === 'resume') {
    const scenes = JSON.parse(readFileSync(resolve(out, 'scenes.json'), 'utf8'));
    const rows = await actionRows();
    assert.ok(
      rows.some(
        (row) =>
          row.botSlug === scenes.independent.bot.slug && row.kind === 'workspace-grant-request',
      ),
    );
    assert.ok(rows.some((row) => row.sourceEventId === scenes.qa.sourceEventId));
    await review(scenes.qa, '回应事项');
    await page.waitForSelector('.bh-human-inbox-reply textarea');
    assert.equal(
      await page.$eval('.bh-human-inbox-reply textarea', (node) => node.disabled),
      false,
    );
    await page.type('.bh-human-inbox-reply textarea', 'Use canary for this Assignment.');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-human-inbox-reply button')].some(
        (node) => node.textContent?.trim() === '发送回复' && !node.disabled,
      ),
    );
    await page.focus('.bh-human-inbox-reply textarea');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    assert.equal(await page.$eval('.bh-human-inbox-reply textarea', (node) => node.value), '');
    await shot('after-restart-qa-ready');
    console.log('Restart preserved independent Grant and pending Assignment actions.');
  } else {
    const stamp = Date.now();
    const grant = await newBot('InboxGrantQA-' + stamp);
    const independent = await newBot('IndependentGrantQA-' + stamp);
    for (const scene of [grant, independent]) {
      await send(
        scene.dm,
        'Call request_workspace_grant once with reason: Please authorize the QA project folder so I can review its release plan. End this turn after creating the card. Do not create an Assignment yet. When Human authorizes the folder, call list_workspace_grants and send one DM message beginning GRANT_QA_READY: with the authorized workspace title. Do not create another request.',
      );
      scene.request = await waitFor(
        async () =>
          (await rpc('channelMessages', { channelId: scene.dm.id })).messages.find(
            (row) => row.grantRequest,
          ),
        'live workspace request',
      );
    }
    await review(grant, '选择工作区');
    await page.waitForSelector('.bh-human-inbox-reply .bh-grant-request-card');
    await theme(false);
    await shot('grant-light');
    await theme(true);
    await shot('grant-dark');
    await theme(false);
    await click('.bh-human-inbox-reply button', '选择文件夹并授权');
    await page.waitForSelector('[data-folder-browser]');
    const initialFolder = await page.$eval(
      '[data-folder-browser-crumb][aria-current="location"]',
      (node) => node.textContent,
    );
    const folderName = 'InboxActionQA-' + stamp;
    const project = resolve(userHome, folderName);
    mkdirSync(project, { recursive: true });
    writeFileSync(
      resolve(project, 'release-plan.txt'),
      'QA release plan: route is chosen by the Human.\n',
    );
    if (initialFolder !== basename(userHome)) {
      await click('[data-folder-browser-crumb]', basename(userHome));
    }
    await click('.bh-human-inbox-reply button', '刷新上下文').catch(() => undefined);
    if (!(await page.$('[data-folder-browser]'))) {
      await click('.bh-human-inbox-reply button', '选择文件夹并授权');
      await page.waitForSelector('[data-folder-browser]');
    }
    await click('[data-folder-browser-item]', folderName);
    await page.waitForFunction(
      (name) =>
        document.querySelector('[data-folder-browser-crumb][aria-current="location"]')
          ?.textContent === name,
      {},
      folderName,
    );
    await shot('folder-picker');
    await click('[role="dialog"]:has([data-folder-browser]) button', '授权此工作区');
    const approved = await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: grant.dm.id })).messages.find(
          (row) => row.grantRequestResolution?.requestMessageId === grant.request.id,
        ),
      'committed Grant-linked reply',
    );
    const grants = (await rpc('grants', { slug: grant.bot.slug })).grants;
    assert.ok(
      grants.some(
        (row) =>
          row.id === approved.grantRequestResolution.grantId && row.workspacePath === project,
      ),
    );
    await waitFor(
      async () => !(await actionRows()).some((row) => row.messageId === grant.request.id),
      'resolved Grant removed',
    );
    assert.ok((await actionRows()).some((row) => row.messageId === independent.request.id));
    await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: grant.dm.id })).messages.some(
          (row) => row.author.kind === 'bot' && row.body.startsWith('GRANT_QA_READY:'),
        ),
      'real Orchestrator resumed after Grant approval',
    );
    console.log('Grant approval committed and real Orchestrator continued.');
    await shot('grant-answered');
    await openDM(grant.dm.id);
    await page.waitForFunction(() => !document.querySelector('.bh-human-inbox-reply'));
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-grant-request-card')].some((node) =>
        node.textContent?.includes('已回复授权请求'),
      ),
    );
    await shot('grant-source-resolved');

    const startAssignment = async (state, tag) => {
      await send(
        grant.dm,
        'Use create_assignment with the existing active Grant and a new continuity key ' +
          tag +
          '. Its purpose must instruct the Assignment: report_to_orchestrator once with state ' +
          state +
          ', summary "' +
          tag +
          ': Which release route should I use: canary or stable?", expects_reply true, then end the turn. Do not run tools, read files or finish the work before the Human route arrives. On resume with the Human route, report_to_orchestrator state completed with summary "' +
          tag +
          '_DONE:" followed by the actual route. Orchestrator must NOT answer this question itself. Wait until the Human explicitly responds in DM. After the Human response, inspect_assignment and relay it using send_assignment_request with answer_to equal to the inspected open ask Source Event ID, mode next-turn. Do not create a duplicate Assignment.',
      );
      const item = await waitFor(
        async () =>
          (await actionRows()).find(
            (row) =>
              row.botSlug === grant.bot.slug &&
              row.summary.includes(tag) &&
              row.kind ===
                (state === 'blocked' ? 'assignment-blocked' : 'assignment-waiting-human'),
          ),
        'live ' + state + ' report',
      );
      return {
        ...grant,
        sessionId: item.assignmentSessionId,
        sourceEventId: item.sourceEventId,
        tag,
      };
    };
    const waiting = await startAssignment('waiting-human', 'WAITING_QA');
    await review(waiting, '回应事项');
    await page.waitForSelector('.bh-human-inbox-reply textarea');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-human-inbox-reply button')].some(
        (node) => node.textContent === '查看附近报告',
      ),
    );
    await shot('assignment-waiting-light');
    await theme(true);
    await shot('assignment-waiting-dark');
    await theme(false);
    await click('.bh-human-inbox-reply button', '查看附近报告');
    await shot('assignment-context');
    await page.type('.bh-human-inbox-reply textarea', 'Use canary for this Assignment.');
    await click('.bh-human-inbox-reply button', '发送回复');
    const response = await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: waiting.dm.id })).messages.find(
          (row) => row.assignmentReply?.sourceEventId === waiting.sourceEventId,
        ),
      'addressed canonical Human response',
    );
    assert.equal(response.assignmentReply.sessionId, waiting.sessionId);
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent.includes('已发送给 Bot'),
    );
    await shot('assignment-replied');
    await waitFor(
      async () =>
        (await rpc('assignment', { slug: waiting.bot.slug, sessionId: waiting.sessionId }))
          .assignment.latestReport?.state === 'completed',
      'real Assignment resumed and completed',
    );
    console.log('Waiting Assignment received the Inbox response and completed.');
    await waitFor(
      async () =>
        !(await actionRows()).some((row) => row.assignmentSessionId === waiting.sessionId),
      'canonical completion removed action',
    );
    await click('.bh-human-inbox-reply button', '打开 Assignment Session');
    await page.waitForFunction(() => !document.querySelector('.bh-root'));
    await shot('assignment-native-session');
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((node) => node.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await page.waitForSelector('.bh-human-inbox-entry');

    const blocked = await startAssignment('blocked', 'BLOCKED_QA');
    await review(blocked, '回应事项');
    await page.waitForSelector('.bh-human-inbox-reply textarea');
    await shot('assignment-blocked');
    console.log('Blocked Assignment ready for concurrent response verification.');
    const secondContext = await browser.createBrowserContext();
    await secondContext.setCookie(...(await page.browserContext().cookies()));
    const other = await secondContext.newPage();
    await other.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await login(other);
    console.log('Second window entered Bot mode.');
    await review(blocked, '回应事项', other);
    await other.waitForSelector('.bh-human-inbox-reply textarea');
    await other.type('.bh-human-inbox-reply textarea', 'Use stable for this Assignment.');
    await click('.bh-human-inbox-reply button', '发送回复', other);
    console.log('Second window submitted the addressed response.');
    await other.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent.includes('已发送给 Bot'),
    );
    await secondContext.close();
    await page.bringToFront();
    await page.type('.bh-human-inbox-reply textarea', 'Use canary instead.');
    await click('.bh-human-inbox-reply button', '发送回复');
    await page.waitForFunction(() =>
      document
        .querySelector('.bh-human-inbox-reply')
        ?.textContent.includes('Use stable for this Assignment.'),
    );
    assert.equal(
      (await rpc('channelMessages', { channelId: blocked.dm.id })).messages.filter(
        (row) => row.assignmentReply?.sourceEventId === blocked.sourceEventId,
      ).length,
      1,
    );
    await shot('assignment-concurrent-stale');
    await waitFor(
      async () =>
        (await rpc('assignment', { slug: blocked.bot.slug, sessionId: blocked.sessionId }))
          .assignment.latestReport?.state === 'completed',
      'blocked Assignment resumed',
    );
    const qa = await startAssignment('waiting-human', 'HUMAN_QA');
    await review(qa, '回应事项');
    await page.waitForSelector('.bh-human-inbox-reply textarea');
    await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
    await page.$eval('.bh-human-inbox-reply', (node) => node.scrollIntoView({ block: 'start' }));
    await shot('assignment-narrow');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await shot('human-qa-ready');
    writeFileSync(
      resolve(out, 'scenes.json'),
      JSON.stringify({ grant, independent, waiting, blocked, qa }, null, 2),
    );
    writeFileSync(
      resolve(out, 'result.json'),
      JSON.stringify(
        {
          grantApproval: true,
          independentRequest: true,
          realModelGrantResume: true,
          waitingCompleted: true,
          blockedCompleted: true,
          concurrentSingleReply: true,
          nativeSessionNavigation: true,
          lightDark: true,
          narrow: true,
          qaPending: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: live Grant approval, waiting and blocked Assignment replies, real model continuation, exact native Session navigation, independent requests and concurrent stale refusal.',
    );
  }
} finally {
  await browser.close();
}
