import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  cpSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'after';
const port = Number(process.env.BH_PURGE_QA_PORT ?? (mode === 'before' ? 31991 : 31990));
const home = resolve(
  process.env.BH_PURGE_QA_HOME ??
    resolve(
      repo,
      '.humanlayer/tasks/897-complete-purge',
      mode === 'before' ? 'qa-base' : 'qa-completion',
    ),
);
const out = resolve(
  process.env.BH_PURGE_QA_OUTPUT ?? resolve(repo, '.humanlayer/tasks/897-complete-purge/evidence'),
);
const sceneFile = resolve(out, 'scene.json');
mkdirSync(out, { recursive: true });
assert.ok(home.includes('897-complete-purge'), 'Use this task-owned disposable Profile only');
assert.ok(out.includes('897-complete-purge'), 'Keep evidence inside this task directory');
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated Profile with dev-instance first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const rpc = (method, args = {}) =>
  page.evaluate(
    async ({ method, args }) => {
      const response = await fetch('/api/botharness/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'botharness/' + method,
          payload: { args },
        }),
      });
      const envelope = await response.json();
      if (!envelope.result?.ok)
        throw new Error(method + ': ' + JSON.stringify(envelope.result?.error));
      return envelope.result.value;
    },
    { method, args },
  );
const click = async (label, selector = 'button') => {
  await page.waitForFunction(
    ({ label, selector }) =>
      [...document.querySelectorAll(selector)].some((el) => el.textContent.trim() === label),
    {},
    { label, selector },
  );
  await page.evaluate(
    ({ label, selector }) =>
      [...document.querySelectorAll(selector)]
        .find((el) => el.textContent.trim() === label)
        .click(),
    { label, selector },
  );
};
const text = () => page.evaluate(() => document.body.innerText);
const shot = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const theme = async (dark) => {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
  ]);
  await page.evaluate(async (dark) => {
    document.body.toggleAttribute('data-ds-dark-theme', dark);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, dark);
};
const sortMenu = () => page.click('.bh-icon-btn[aria-label="更多"]');
const selectHistory = async (groupId) => {
  const record = (await rpc('channelHistory')).channels.find((c) => c.id === groupId);
  assert.ok(record, 'Synthetic ended Group is retained');
  await page.waitForSelector(`[data-history-channel-id="${groupId}"] button`);
  await page.click(`[data-history-channel-id="${groupId}"] button`);
};
const openHistory = async (groupId) => {
  await sortMenu();
  await click('已结束会话的历史', '[role=menuitem]');
  await page.waitForSelector('[data-channel-history]');
  await selectHistory(groupId);
  await page.waitForSelector('[data-history-source]');
};
const dbPath = resolve(home, 'botharness/botharness.db');
const read = (query, ...args) => {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(query).all(...args);
  } finally {
    db.close();
  }
};
const files = resolve(home, 'botharness/attachments/files');
const fileDirectory = (ref) => resolve(files, ref.fileId.slice(5));
const select = async (body) => {
  await page.evaluate((body) => {
    const row = [...document.querySelectorAll('[data-history-source]')].find((el) =>
      el.textContent.includes(body),
    );
    assertEnabled(row?.querySelector('input'));
    function assertEnabled(input) {
      if (!input || input.disabled) throw new Error('Source is unavailable');
      input.click();
    }
  }, body);
};
const send = async (body, name) => {
  await page.waitForFunction(() => {
    const input = document.querySelector('.bh-composer-input');
    return input && !input.disabled && input.getAttribute('aria-disabled') !== 'true';
  });
  if (name) {
    await page.evaluate((name) => {
      const input = document.querySelector('input.bh-composer-file-input');
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(['disposable synthetic bytes: ' + name], name, { type: 'text/plain' }),
      );
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, name);
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('.bh-composer-file-attachment[data-status="ready"]')].some(
          (el) => el.textContent.includes(name),
        ),
      {},
      name,
    );
  }
  await page.focus('.bh-composer-input');
  await page.keyboard.sendCharacter(body);
  await page.waitForFunction(
    (body) => {
      const input = document.querySelector('.bh-composer-input');
      return (input?.value ?? input?.innerText) === body;
    },
    {},
    body,
  );
  await page.waitForFunction(() => !document.querySelector('.bh-send-btn').disabled);
  await page.locator('.bh-send-btn').click();
  await page.waitForFunction(
    (body) => {
      const input = document.querySelector('.bh-composer-input');
      return (
        (input?.value ?? input?.innerText) === '' &&
        document.body.innerText.includes(body) &&
        !document.querySelector('.bh-composer-file-attachment') &&
        !document.querySelector('.bh-send-btn:not(:disabled)')
      );
    },
    {},
    body,
  );
};
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bh-panel-glyph');
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '继续'),
      { timeout: 6000 },
    )
    .catch(() => {});
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '继续')?.click(),
  );
  await page.waitForFunction(
    () => ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '继续'),
  );
  await page.click('button:has(.bh-panel-glyph)');
  await page.waitForSelector('.bh-region');
  if (mode === 'restart' || mode === 'restore') {
    const scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
    await openHistory(scene.groupId);
    const history = (await rpc('channelHistorySources', { channelId: scene.groupId })).sources;
    assert.equal(history.filter((source) => source.purgedAt).length, 2);
    assert.equal(
      history.some((source) => source.body.includes('ERASE')),
      false,
    );
    assert.ok(history.some((source) => source.body.includes('KEEP')));
    assert.equal(existsSync(fileDirectory(scene.exclusive)), false);
    assert.equal(existsSync(fileDirectory(scene.shared)), true);
    assert.equal(
      history.some((source) => source.cleanupPending),
      false,
    );
    assert.ok(
      read('SELECT body FROM source_events WHERE channel_id = ?', scene.otherId).some((row) =>
        row.body.includes('SHARED_KEEP'),
      ),
    );
    await theme(false);
    await shot(mode + '-light');
    await theme(true);
    await shot(mode + '-dark');
    console.log(
      'PASS ' +
        mode +
        ': ledger reapplied before Messaging, exclusive file absent, shared file and unselected history retained',
    );
  } else {
    const name = 'Purge completion synthetic QA';
    for (const channel of (await rpc('channels')).channels) {
      assert.equal(channel.name, name, 'Only this disposable fixture may be ended');
      await rpc('channelGroupDelete', { channelId: channel.id });
    }
    const group = (await rpc('channelCreate', { name, members: [] })).channel;
    const other = (await rpc('channelCreate', { name, members: [] })).channel;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-channel-id="${group.id}"]`);
    await page.click(`[data-channel-id="${group.id}"]`);
    await page.waitForSelector('.bh-composer-input');
    if (mode === 'before') {
      const fileId = 'file:' + randomUUID();
      const bytes = Buffer.from('disposable synthetic bytes: exclusive.txt');
      const ref = { fileId, name: 'exclusive.txt', mime: 'text/plain', size: bytes.length };
      const dir = fileDirectory(ref);
      mkdirSync(resolve(dir, 'data'), { recursive: true });
      writeFileSync(resolve(dir, 'data', ref.name), bytes);
      writeFileSync(
        resolve(dir, 'record.json'),
        JSON.stringify({ ref, checksum: createHash('sha256').update(bytes).digest('hex') }),
      );
      await rpc('channelSend', {
        channelId: group.id,
        body: 'ERASE exclusive attachment',
        attachments: [ref],
      });
    } else {
      await send('ERASE exclusive attachment', 'exclusive.txt');
      await send('ERASE shared attachment', 'shared.txt');
    }
    await send('KEEP unselected history');
    const selected = read(
      'SELECT source_event_id, body, payload_json FROM source_events WHERE channel_id = ?',
      group.id,
    );
    const exclusive = JSON.parse(
      selected.find((row) => row.body.includes('exclusive')).payload_json,
    ).attachments[0];
    const shared =
      mode === 'before'
        ? undefined
        : JSON.parse(selected.find((row) => row.body.includes('shared')).payload_json)
            .attachments[0];
    if (shared)
      await rpc('channelSend', {
        channelId: other.id,
        body: 'SHARED_KEEP another Channel',
        attachments: [shared],
      });
    await page.click('[aria-label="更多群管理操作"]');
    await click('解散群聊', '[role=menuitem]');
    await click('解散群聊', '[role=dialog] button');
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-channel-id="${id}"]`),
      {},
      group.id,
    );
    await openHistory(group.id);
    if (mode === 'before') {
      await theme(false);
      await shot('before-files-light');
      await theme(true);
      await shot('before-files-dark');
      assert.ok(
        (await rpc('channelHistorySources', { channelId: group.id })).sources.some(
          (source) => source.refusal,
        ),
      );
      console.log('PASS baseline refuses file-bearing Source Event');
    } else {
      await select('ERASE exclusive');
      await select('ERASE shared');
      await click('预览内容清除范围');
      await page.waitForFunction(
        () =>
          document.body.innerText.includes('独占，清除') &&
          document.body.innerText.includes('共享，保留'),
      );
      await theme(false);
      await shot('after-files-light');
      await theme(true);
      await shot('after-files-dark');
      const rect = await page.$eval('[role="dialog"]:has([data-channel-history])', (el) =>
        el.getBoundingClientRect().toJSON(),
      );
      assert.equal(rect.width, 560);
      assert.ok(rect.top >= 24 && rect.bottom <= 876);
      await page.click('[aria-label="清除边界的说明"]');
      await page.waitForFunction(() => document.body.innerText.includes('DSH Session'));
      await shot('after-boundaries-dark');
      await page.click('[aria-label="清除边界的说明"]');
      await click('取消');
      assert.equal(
        (await rpc('channelHistorySources', { channelId: group.id })).sources.filter((source) =>
          source.body.includes('ERASE'),
        ).length,
        2,
      );
      assert.ok(existsSync(fileDirectory(exclusive)) && existsSync(fileDirectory(shared)));
      const older = resolve(out, 'older.db');
      assert.equal(existsSync(older), false, 'Snapshot must be new');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        db.exec("VACUUM INTO '" + older.replaceAll("'", "''") + "'");
      } finally {
        db.close();
      }
      cpSync(resolve(home, 'botharness/attachments'), resolve(out, 'older-attachments'), {
        recursive: true,
      });
      const directory = fileDirectory(exclusive);
      assert.ok(directory.startsWith(files + '\\') || directory.startsWith(files + '/'));
      const held = directory + '-held';
      renameSync(directory, held);
      symlinkSync(held, directory, process.platform === 'win32' ? 'junction' : 'dir');
      await click('预览内容清除范围');
      await click('确认永久清除所选正文');
      await page.waitForFunction(() => document.body.innerText.includes('附件待清理'));
      const history = (await rpc('channelHistorySources', { channelId: group.id })).sources;
      assert.equal(history.filter((source) => source.purgedAt).length, 2);
      assert.equal(
        history.some((source) => source.body.includes('ERASE')),
        false,
      );
      assert.equal(existsSync(fileDirectory(shared)), true);
      await theme(false);
      await shot('after-pending-light');
      await theme(true);
      await shot('after-pending-dark');
      await page.setViewport({ width: 390, height: 620, deviceScaleFactor: 1 });
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="dialog"]:has([data-channel-history])')
            .getBoundingClientRect().width <=
          innerWidth - 48,
      );
      await shot('after-compact-dark');
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]:has([data-channel-history])'),
      );
      unlinkSync(directory);
      renameSync(held, directory);
      writeFileSync(
        sceneFile,
        JSON.stringify({ groupId: group.id, otherId: other.id, exclusive, shared }, null, 2),
      );
      console.log(
        'PASS real Client upload/end/preview/cancel/purge; shared file retained, cleanup interrupted safely; restart required',
      );
    }
  }
} catch (error) {
  await shot('failure-' + mode).catch(() => {});
  console.error((await text()).slice(0, 2500));
  throw error;
} finally {
  await browser.close();
}
