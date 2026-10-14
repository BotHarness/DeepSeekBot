import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
if (!origin || !home) throw new Error('Set BH_E2E_ORIGIN and BH_E2E_HOME');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  `/tmp/dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  'utf8',
).split(';')[0];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `group-management-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(`${method}: ${response.status} ${JSON.stringify(envelope.result?.error)}`);
  return envelope.result.value;
}

async function waitFor(predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(300);
  }
  throw new Error(`Timed out: ${label}`);
}

async function groupRecord(id) {
  return (await rpc('channels')).channels.find((channel) => channel.id === id);
}

if (process.argv[2] === '--verify-restart') {
  const [, , , groupId, targetSlug, expectedName] = process.argv;
  if (!groupId || !targetSlug || !expectedName) throw new Error('Missing restart check arguments');
  const group = await groupRecord(groupId);
  const invitation = group?.invitations?.find((item) => item.targetBotSlug === targetSlug);
  if (group?.name !== expectedName || !group.avatar || invitation?.inviterHuman !== true)
    throw new Error('Group settings or Human invitation lost after restart');
  const admission = (await rpc('botAttention', { slug: targetSlug })).items.find(
    (item) => item.reason === 'group-invite',
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        groupId,
        name: group.name,
        avatar: true,
        members: group.members,
        invitationStatus: invitation.status,
        botInboxState: admission?.state,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (process.argv[2] === '--remove-member') {
  const [, , , groupId, targetSlug] = process.argv;
  if (!groupId || !targetSlug) throw new Error('Missing Group or member');
  if (!(await groupRecord(groupId))?.members.includes(targetSlug))
    throw new Error('Target is not a Group member');
  const memberIndex = (await groupRecord(groupId)).members.indexOf(targetSlug);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    await page.setExtraHTTPHeaders({ cookie });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
        ?.click(),
    );
    const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
    await page.waitForSelector(botButton);
    if (!(await page.$('.bh-root'))) await page.click(botButton);
    await page.waitForSelector('.bh-root');
    const openSidebar = await page.$('button[aria-label="Open sidebar"]');
    if (openSidebar) await openSidebar.click();
    await page.waitForSelector(`.bh-root [data-channel-id="${groupId}"]`);
    await page.click(`.bh-root [data-channel-id="${groupId}"]`);
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('[data-sidebar-entry]')).find((entry) =>
        ['成员', 'Members'].includes(entry.querySelector('[data-panel-label]')?.textContent ?? ''),
      );
      const button = section?.querySelector('[data-panel-head]');
      if (button?.getAttribute('aria-expanded') === 'false') button.click();
    });
    await page.waitForSelector('.bh-member-menu-button');
    await (await page.$$('.bh-member-menu-button'))[memberIndex].click();
    await page.waitForSelector('[role="menu"]');
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('[role="menu"] button'))
        .find((button) =>
          ['消息提醒设置', 'Message attention settings'].includes(button.textContent?.trim() ?? ''),
        )
        ?.click();
    });
    await page.waitForSelector('[data-member-wake-mode]');
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('[data-member-wake-mode]'))
        .find((button) => ['静默收件', 'Silent inbox'].includes(button.textContent?.trim() ?? ''))
        ?.click();
    });
    await sleep(500);
    await page.screenshot({ path: '/tmp/bh390-member-policy.png' });
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button'))
        .find((button) =>
          ['保存提醒设置', 'Save attention setting'].includes(button.textContent?.trim() ?? ''),
        )
        ?.click();
    });
    await waitFor(
      async () => (await groupRecord(groupId))?.wakePolicies?.[targetSlug]?.mode === 'silent',
      'member wake policy',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bh-member-row');
    await (await page.$$('.bh-member-row'))[memberIndex].click({ button: 'right' });
    await page.waitForSelector('[role="menu"]');
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('[role="menu"] button'))
        .find((button) => ['打开私聊', 'Open Bot DM'].includes(button.textContent?.trim() ?? ''))
        ?.click();
    });
    await page.waitForFunction(
      (slug) =>
        document.querySelector(`[data-channel-id="dm-${slug}"]`)?.classList.contains('bh-selected'),
      {},
      targetSlug,
    );
    await page.click(`.bh-root [data-channel-id="${groupId}"]`);
    await page.waitForSelector('.bh-member-menu-button');
    await page.screenshot({ path: '/tmp/bh390-member-before-removal.png' });
    await (await page.$$('.bh-member-menu-button'))[memberIndex].click();
    await page.waitForSelector('[role="menu"]');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('[role="menu"] button'))
        .find((button) =>
          ['移出群聊', 'Remove from Group'].includes(button.textContent?.trim() ?? ''),
        )
        ?.click();
    });
    await waitFor(
      async () => !(await groupRecord(groupId))?.members.includes(targetSlug),
      'member removal',
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          groupId,
          removed: targetSlug,
          screenshot: '/tmp/bh390-member-before-removal.png',
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
  process.exit(0);
}

if (process.argv[2] === '--join-requests' || process.argv[2] === '--seed-join-request') {
  const groupId = process.argv[3];
  const group = groupId ? await groupRecord(groupId) : undefined;
  if (!group) throw new Error('Group unavailable');
  const bots = [];
  for (const decision of process.argv[2] === '--seed-join-request'
    ? ['accept']
    : ['accept', 'decline']) {
    const bot = (await rpc('create', { displayName: `Join ${decision} ${Date.now()}` })).bot;
    if (!bot?.slug) throw new Error('Join requester unavailable');
    bots.push({ ...bot, decision });
    await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
    const body = `Please request to join #${group.name}. Call group_join_request for this selected Group now.`;
    const start = body.indexOf('#');
    await rpc('channelSend', {
      channelId: `dm-${bot.slug}`,
      body,
      channelRefs: [
        { channelId: group.id, label: group.name, start, end: start + group.name.length + 1 },
      ],
    });
    await waitFor(
      async () =>
        Boolean(
          (await groupRecord(group.id))?.joinRequests?.some(
            (request) => request.requesterBotSlug === bot.slug && request.status === 'pending',
          ),
        ),
      `join request from ${bot.slug}`,
      180_000,
    );
  }
  if (process.argv[2] === '--seed-join-request') {
    console.log(
      JSON.stringify({ ok: true, groupId: group.id, requester: bots[0].displayName }, null, 2),
    );
    process.exit(0);
  }
  const memberIndex = (await groupRecord(groupId)).members.indexOf(targetSlug);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    await page.setExtraHTTPHeaders({ cookie });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
        ?.click(),
    );
    const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
    await page.waitForSelector(botButton);
    if (!(await page.$('.bh-root'))) await page.click(botButton);
    await page.waitForSelector('.bh-root');
    const openSidebar = await page.$('button[aria-label="Open sidebar"]');
    if (openSidebar) await openSidebar.click();
    await page.waitForSelector(`.bh-root [data-channel-id="${group.id}"]`);
    await page.click(`.bh-root [data-channel-id="${group.id}"]`);
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('[data-sidebar-entry]')).find((entry) =>
        ['群管理', 'Group management'].includes(
          entry.querySelector('[data-panel-label]')?.textContent ?? '',
        ),
      );
      const button = section?.querySelector('[data-panel-head]');
      if (button?.getAttribute('aria-expanded') === 'false') button.click();
    });
    await page.waitForSelector('[data-sidebar-entry="group-management"] [data-sidebar-entry-body]');
    await page.click(
      'button[aria-label^="Invitations and join requests"], button[aria-label^="邀请与入群申请"]',
    );
    await page.waitForSelector('[data-group-attention]');
    await page.screenshot({ path: '/tmp/bh390-join-requests-before.png' });
    for (const bot of bots) {
      const clicked = await page.evaluate(
        ({ name, decision }) => {
          const row = Array.from(document.querySelectorAll('[data-group-attention-item]')).find(
            (item) => item.textContent?.includes(name),
          );
          const button = Array.from(row?.querySelectorAll('button') ?? []).find((item) =>
            decision === 'accept'
              ? ['Approve', '批准'].includes(item.textContent?.trim() ?? '')
              : ['Decline', '拒绝'].includes(item.textContent?.trim() ?? ''),
          );
          button?.click();
          return Boolean(button);
        },
        { name: bot.displayName, decision: bot.decision },
      );
      if (!clicked) throw new Error(`Missing ${bot.decision} control for ${bot.displayName}`);
      await waitFor(
        async () =>
          Boolean(
            (await groupRecord(group.id))?.joinRequests?.some(
              (request) =>
                request.requesterBotSlug === bot.slug &&
                request.status === (bot.decision === 'accept' ? 'accepted' : 'declined'),
            ),
          ),
        `${bot.decision} decision`,
      );
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    const final = await groupRecord(group.id);
    if (!final.members.includes(bots[0].slug) || final.members.includes(bots[1].slug))
      throw new Error('Join decisions changed the wrong membership');
    console.log(
      JSON.stringify(
        {
          ok: true,
          groupId: group.id,
          accepted: bots[0].slug,
          declined: bots[1].slug,
          screenshot: '/tmp/bh390-join-requests-before.png',
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
  process.exit(0);
}

const stamp = Date.now();
const target = (await rpc('create', { displayName: `Manage Invite ${stamp}` })).bot;
const group = (await rpc('channelCreate', { name: `Manage QA ${stamp}`, members: [] })).channel;
const disposable = (await rpc('channelCreate', { name: `Disband QA ${stamp}`, members: [] }))
  .channel;
if (!target?.slug || !group?.id || !disposable?.id) throw new Error('Missing QA fixtures');

const avatarPath = `/tmp/bh390-avatar-${stamp}.png`;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.log('Browser console', message.type(), message.text());
  });
  await page.setViewport({ width: 1440, height: 960 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForSelector('.bh-root');
  const openSidebar = await page.$('button[aria-label="Open sidebar"]');
  if (openSidebar) await openSidebar.click();
  await page.waitForSelector(`.bh-root [data-channel-id="${group.id}"]`);

  async function openGroup(id) {
    await page.click(`.bh-root [data-channel-id="${id}"]`);
    await page.waitForFunction(
      (channelId) =>
        document
          .querySelector(`.bh-root [data-channel-id="${channelId}"]`)
          ?.classList.contains('bh-selected'),
      {},
      id,
    );
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('[data-sidebar-entry]')).find((entry) =>
        ['群管理', 'Group management'].includes(
          entry.querySelector('[data-panel-label]')?.textContent ?? '',
        ),
      );
      const button = section?.querySelector('[data-panel-head]');
      if (button?.getAttribute('aria-expanded') === 'false') button.click();
    });
    await page.waitForSelector('[data-sidebar-entry="group-management"] [data-sidebar-entry-body]');
  }

  await openGroup(group.id);
  const samplePng = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = '#427fe9';
    context.fillRect(0, 0, 80, 80);
    context.fillStyle = '#e97f42';
    context.fillRect(80, 0, 80, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(avatarPath, Buffer.from(samplePng, 'base64'));
  const membersText = await page.$eval('[data-sidebar-entry]', (entry) => entry.textContent);
  if (membersText?.includes('Join requests') || membersText?.includes('Disband Group'))
    throw new Error('Members section still contains management actions');

  const renamed = `Renamed QA ${stamp}`;
  const groupName =
    '[data-sidebar-entry="group-management"] input[aria-label="群名"], [data-sidebar-entry="group-management"] input[aria-label="Group name"]';
  await page.$eval(
    groupName,
    (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    renamed,
  );
  await page.focus(groupName);
  await page.keyboard.press('Enter');
  await waitFor(async () => (await groupRecord(group.id))?.name === renamed, 'Group rename');

  await (
    await page.$('[data-sidebar-entry="group-management"] input[type="file"]')
  ).uploadFile(avatarPath);
  await page.waitForSelector('.bh-group-avatar-crop-viewport img');
  await page.$eval('#bh-group-avatar-zoom', (input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '1.5');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const crop = await page.$('.bh-group-avatar-crop-viewport');
  const cropRect = await crop.boundingBox();
  await page.mouse.move(cropRect.x + 140, cropRect.y + 140);
  await page.mouse.down();
  await page.mouse.move(cropRect.x + 165, cropRect.y + 140, { steps: 5 });
  await page.mouse.up();
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['保存头像', 'Save avatar'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await waitFor(async () => Boolean((await groupRecord(group.id))?.avatar), 'Group avatar');
  if (!(await groupRecord(group.id)).avatar.startsWith('data:image/webp;base64,'))
    throw new Error('Group avatar was not saved as WebP');

  await page.click('button[aria-label="Invite member"], button[aria-label="邀请新群员"]');
  await page.waitForSelector('[data-group-invite]');
  await page.type('[data-group-invite-search]', target.displayName.slice(0, 8));
  await sleep(350);
  await page.evaluate((name) => {
    Array.from(document.querySelectorAll('[data-group-invite-option]'))
      .find((button) => button.textContent?.includes(name))
      ?.click();
  }, target.displayName);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('button')).some(
      (button) =>
        ['邀请新群员', 'Invite member'].includes(button.textContent?.trim() ?? '') &&
        !button.disabled,
    ),
  );
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find(
        (button) =>
          ['邀请新群员', 'Invite member'].includes(button.textContent?.trim() ?? '') &&
          !button.disabled,
      )
      ?.click();
  });
  await waitFor(
    async () =>
      Boolean(
        (await groupRecord(group.id))?.invitations?.some(
          (item) => item.targetBotSlug === target.slug,
        ),
      ),
    'Human invitation',
  );
  const invited = await groupRecord(group.id);
  if (invited.invitations.find((item) => item.targetBotSlug === target.slug)?.inviterHuman !== true)
    throw new Error('Human invitation lost its actor');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`.bh-root [data-channel-id="${group.id}"]`);
  await openGroup(group.id);
  if ((await groupRecord(group.id))?.name !== renamed || !(await groupRecord(group.id))?.avatar)
    throw new Error('Group settings lost after refresh');
  const geometry = await page.evaluate(() => {
    const measure = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { x: rect.x, right: rect.right, height: rect.height } : null;
    };
    return {
      nativeNewSession: measure('button[aria-label="New Session"], button[aria-label="新会话"]'),
      members: measure('[data-panel-head]'),
      groupManagement: measure('[data-sidebar-entry="group-management"] [data-sidebar-entry-body]'),
    };
  });
  await page.screenshot({ path: `/tmp/bh390-group-management-${stamp}.png` });

  await openGroup(disposable.id);
  await page.click(
    'button[aria-label="More Group management actions"], button[aria-label="更多群管理操作"]',
  );
  await page.waitForSelector('[role="menu"]');
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('[role="menu"] button'))
      .find((button) => ['解散群聊', 'Disband Group'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['解散群聊', 'Disband Group'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await waitFor(async () => (await groupRecord(disposable.id)) === undefined, 'Group disband');
  console.log(
    JSON.stringify(
      {
        ok: true,
        groupId: group.id,
        targetSlug: target.slug,
        renamed,
        avatar: true,
        invitation: true,
        disbanded: disposable.id,
        geometry,
        screenshot: `/tmp/bh390-group-management-${stamp}.png`,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
