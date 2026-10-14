import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

export async function waitFor(test, label) {
  for (let n = 0; n < 180; n++) {
    const result = await test();
    if (result) return result;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw Error('Timed out: ' + label);
}

const modules = resolve('node_modules/.pnpm');
export const installed = (name) =>
  createRequire(
    resolve(
      modules,
      readdirSync(modules).find((d) => d.startsWith(name + '@')),
      'node_modules/',
    ),
  )(name);

export function assignmentProbe({ origin, home, freshConnections = false }) {
  assert.ok(
    new URL(origin).protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname),
  );
  const cookie = readFileSync(
    resolve(tmpdir(), 'dsh-' + basename(home) + '.cookies'),
    'utf8',
  ).split(';')[0];
  async function rpc(method, args = {}, namespace = 'botharness') {
    const response = await fetch(origin + '/api/' + namespace + '/' + method, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        ...(freshConnections ? { connection: 'close' } : {}),
      },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: crypto.randomUUID(),
        method: namespace + '/' + method,
        payload: { args },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const result = (await response.json()).result;
    assert.equal(result?.ok, true, method + ': ' + JSON.stringify(result?.error));
    return result.value;
  }

  const WebSocket = installed('ws');
  async function nativeSnapshot(sessionId) {
    const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/api/remote.mux', {
      headers: { cookie },
    });
    try {
      await new Promise((done, reject) => {
        socket.once('open', done);
        socket.once('error', reject);
      });
      return await new Promise((done, reject) => {
        const timeout = setTimeout(() => reject(Error('native snapshot timeout')), 20000);
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        socket.on('message', (raw) => {
          const f = JSON.parse(String(raw));
          if (f.type === 'error') {
            clearTimeout(timeout);
            reject(Error(JSON.stringify(f.error)));
          }
          if (f.type === 'item' && f.value.type === 'snapshot') {
            clearTimeout(timeout);
            if (f.value.hasMore !== false) reject(Error('Incomplete native Session snapshot'));
            else done(f.value);
          }
        });
        socket.send(
          JSON.stringify({
            type: 'open',
            streamId: crypto.randomUUID(),
            endpoint: 'session/follow',
            payload: {
              args: { request: { address: { kind: 'session', sessionId }, maxMessages: 100 } },
            },
          }),
        );
      });
    } finally {
      socket.terminate();
    }
  }

  return { rpc, nativeSnapshot, cookie };
}

export async function captureAssignmentInbox({
  origin,
  cookie,
  evidence,
  scene,
  reports,
  nativeEvents,
  writeProof,
  expectedTurns,
  purpose,
  sourceSummary,
}) {
  const puppeteer = installed('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const split = cookie.indexOf('=');
    await browser.setCookie({
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      domain: new URL(origin).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 1500, height: 1000 });
    const navigation = [];
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.webSocketFrameSent', ({ response }) => {
      try {
        const frame = JSON.parse(response.payloadData);
        if (frame.type === 'open' && frame.endpoint === 'session/follow')
          navigation.push(frame.payload?.args?.request?.address?.sessionId);
      } catch {}
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some((b) =>
            ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
          ),
        { timeout: 10000 },
      )
      .catch(() => undefined);
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    for (let n = 0; n < 3 && !(await page.$('.bh-main')); n++) {
      await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('button')].some((b) =>
              ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
            ) || document.querySelector('.bh-main'),
          { timeout: 5000 },
        )
        .catch(() => undefined);
      await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => undefined);
    }
    await page.waitForSelector('[data-channel-id="' + scene.dm + '"]');
    await page.click('[data-channel-id="' + scene.dm + '"]');
    await page.waitForSelector('.bh-channel-island[aria-haspopup="dialog"]');
    await page.click('.bh-channel-island[aria-haspopup="dialog"]');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some((b) =>
        ['View details', '查看详情', '查看详细'].includes(b.textContent?.trim() ?? ''),
      ),
    );
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['View details', '查看详情', '查看详细'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    await page.waitForSelector('.bh-profile-view');
    await page.evaluate(() => {
      for (const e of document.querySelectorAll('[data-panel-head]'))
        if (
          /Bot Inbox|Bot 收件箱/.test(e.textContent ?? '') &&
          e.getAttribute('aria-expanded') !== 'true'
        )
          e.click();
    });
    await page.waitForSelector('[data-inbox-group]');
    await page.evaluate(() => {
      for (const e of document.querySelectorAll(
        '[data-inbox-group] > summary,.bh-inbox-history > summary',
      ))
        if (!e.parentElement.open) e.click();
    });
    await page.waitForSelector('.bh-inbox-item');
    await page.evaluate((purpose) => {
      for (const group of document.querySelectorAll('[data-inbox-group]')) {
        const keep = group
          .querySelector('[data-inbox-group] > summary')
          ?.textContent.includes(purpose);
        if (group.open !== keep) group.querySelector('summary').click();
      }
    }, purpose);
    await page.waitForFunction(
      () =>
        !document.querySelector('.bh-profile-view')?.textContent.includes('正在刷新用量') &&
        !document.querySelector('.bh-profile-view')?.textContent.includes('Refreshing usage'),
      { timeout: 15000 },
    );
    for (const theme of ['light', 'dark']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
      await page.screenshot({
        path: resolve(evidence, scene.lastPhase + '-inbox-' + theme + '.png'),
      });
    }
    const beforeItems = await reports();
    await page.evaluate(
      (sourceSummary) =>
        [...document.querySelectorAll('button.bh-inbox-item')]
          .find((e) => e.querySelector('.bh-inbox-item-summary')?.textContent === sourceSummary)
          ?.click(),
      sourceSummary,
    );
    await waitFor(
      () => navigation.includes(scene.sessionId),
      'native Source navigation to owned Assignment',
    );
    assert.deepEqual(
      (await reports()).map(({ id, state, observedAt }) => ({ id, state, observedAt })),
      beforeItems.map(({ id, state, observedAt }) => ({ id, state, observedAt })),
      'Human viewing must not observe Reports',
    );
    assert.equal(
      (await nativeEvents()).filter((e) => e.type === 'turn/start').length,
      expectedTurns,
      'source viewing must not wake Orchestrator',
    );
    writeProof('source-navigation-' + scene.lastPhase + '.json', {
      assignmentSessionId: scene.sessionId,
      nativeEndpoint: 'session/follow',
      sourceNavigation: true,
      humanViewingDidNotObserve: true,
      humanViewingDidNotWake: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
