import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2];
assert.ok(
  [
    '--serve',
    '--prepare',
    '--ready',
    '--select-home',
    '--open-new',
    '--preview-task',
    '--complete',
    '--restore',
  ].includes(mode),
);
const port = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32021);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const fixture = `http://127.0.0.1:${port}`;
if (mode === '--serve') {
  const receipts = [];
  const titles = { home: 'Entry home', work: 'Entry work', next: 'Entry next' };
  createServer(async (req, res) => {
    const url = new URL(req.url, fixture);
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/state') return res.end(JSON.stringify({ receipts }));
    if (url.pathname === '/confirm' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const r = JSON.parse(body);
      assert.equal(r.page, 'next');
      assert.equal(r.token, 'CURRENT-NEXT');
      receipts.push(r);
      return res.end(JSON.stringify({ completed: receipts.length }));
    }
    const page = url.pathname.slice(1);
    if (!titles[page]) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><title>${titles[page]}</title><body style="font:24px sans-serif;background:white;color:#111;padding:32px"><h1>${titles[page]}</h1><p>Owned tab: /${page}</p>${page === 'next' ? `<label>Task token <input aria-label="Task token" style="font:24px sans-serif"></label><p><button style="font:24px sans-serif">Complete task</button></p><p id="receipt">Completed: 0</p><script>document.querySelector('button').onclick=async()=>{const r=await(await fetch('/confirm',{method:'POST',body:JSON.stringify({page:'next',token:document.querySelector('input').value})})).json();document.querySelector('#receipt').textContent='Completed: '+r.completed+'; Last token: CURRENT-NEXT'}</script>` : '<p>Human preview is independent of Bot work.</p>'}</body>`,
    );
  }).listen(port, '127.0.0.1');
} else {
  const home = process.env.BH_E2E_HOME,
    origin = process.env.BH_E2E_ORIGIN,
    statePath = process.env.BH_E2E_STATE;
  assert.ok(home && origin && statePath);
  const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
    ';',
  )[0];
  const save = (state) =>
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  async function route(path, body) {
    const r = await fetch(`${origin}/api/${path}`, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { cookie, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const v = await r.json();
    assert.equal(r.ok, true, JSON.stringify(v));
    return v;
  }
  async function rpc(ns, name, args = {}) {
    const r = await route(`${ns}/${name}`, {
      type: 'client-request',
      rpcId: `multitab-${Date.now()}-${Math.random()}`,
      method: `${ns}/${name}`,
      payload: { args },
    });
    assert.equal(r.result?.ok, true, JSON.stringify(r.result?.error));
    return r.result.value;
  }
  const api = (name, args) => rpc('botharness', name, args);
  const view = (bot) => route(`browser/observation?slug=${encodeURIComponent(bot.slug)}`);
  const server = async () => (await fetch(`${fixture}/state`)).json();
  async function events(bot) {
    const projection = await rpc('session', 'projections', {
      request: { sessionId: bot.sessionId },
    });
    const p = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId: bot.sessionId },
        throughSeq: projection.asOfSeq,
        maxMessages: 100,
      },
    });
    return p.records.filter((r) => r.type === 'event').map((r) => r.event);
  }
  function results(rows) {
    const calls = new Map(
      rows.filter((r) => r.type === 'tool/call').map((r) => [r.data.callId, r.data]),
    );
    return rows
      .filter((r) => r.type === 'tool/result')
      .map((r) => ({ call: calls.get(r.data.message.toolCallId), message: r.data.message }));
  }
  function successful(rows, name) {
    const r = results(rows).find((r) => r.call?.name === name && !r.message.isError);
    assert.ok(r, `${name} must actually succeed`);
    return r;
  }
  async function until(read, test, message) {
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const v = await read();
      if (test(v)) return v;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw Error(message);
  }
  async function model(bot, body) {
    const prior = Math.max(0, ...(await events(bot)).map((e) => e.seq));
    const start = Date.now();
    await api('channelSend', { channelId: bot.channelId, body });
    const rows = await until(
      () => events(bot),
      (rows) => rows.some((e) => e.seq > prior && e.type === 'turn/end'),
      'Real model did not finish',
    );
    return { start, end: Date.now(), rows: rows.filter((e) => e.seq > prior) };
  }
  async function change(bot, action, url) {
    const run = await model(
      bot,
      action === 'open'
        ? `本地入口 QA：browser_tabs action=open 打开 ${url}，browser_observe 确认标题，再 bot_send_message 回复实际标题与 URL。不要点击或输入。`
        : `本地入口 QA：browser_tabs action=list，select URL 完全等于 ${url} 的标签，browser_observe 确认标题，再 bot_send_message 回复实际标题与 URL。不要打开新标签，不要点击或输入。`,
    );
    for (const name of ['browser_tabs', 'browser_observe', 'bot_send_message'])
      successful(run.rows, name);
    const v = await view(bot);
    assert.equal(v.tabs.find((t) => t.current)?.url, url);
    assert.equal(v.focused, v.tabs.find((t) => t.current)?.targetId);
    return v;
  }
  if (mode === '--prepare') {
    const bot = (await api('create', { displayName: 'Browser entry QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    save({ phase: 'off', bot: { slug: bot.slug, channelId: dm.id } });
    console.log('Verify access off and enable it through the Client header, then --ready.');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const bot = state.bot;
    if (mode === '--ready') {
      assert.equal(state.phase, 'off');
      assert.equal((await api('list')).bots.find((b) => b.slug === bot.slug).browserAccess, true);
      await api('channelSend', {
        channelId: bot.channelId,
        body: `本地入口 QA：browser_open 打开 ${fixture}/home；browser_tabs action=open 打开 ${fixture}/work；browser_tabs action=list；browser_observe 确认 Entry work，再 bot_send_message 回复实际标题与 URL。不要点击或输入。`,
      });
      bot.sessionId = await until(
        async () =>
          (await api('sessions', { slug: bot.slug })).sessions.find(
            (s) => s.role === 'orchestrator',
          )?.sessionId,
        Boolean,
        'Session missing',
      );
      save({ ...state, bot, phase: 'approval' });
      console.log('Approve the exact local synthetic opening once in the Bot DM.');
      const rows = await until(
        () => events(bot),
        (rows) => rows.some((e) => e.type === 'turn/end'),
        'Real model setup incomplete',
      );
      for (const name of ['browser_open', 'browser_tabs', 'browser_observe', 'bot_send_message'])
        successful(rows, name);
      const v = await view(bot);
      assert.equal(v.tabs.length, 2);
      assert.equal(v.tabs.find((t) => t.current)?.url, `${fixture}/work`);
      bot.home = v.tabs.find((t) => t.url === `${fixture}/home`).targetId;
      bot.work = v.focused;
      save({ ...state, bot, phase: 'ready', modelInitialTabs: true });
      console.log('Real model opened owned home/work tabs; work is current.');
    } else if (mode === '--restore') {
      if ((await view(bot)).tabs.length === 0) {
        const run = await model(
          bot,
          `本地入口 QA 恢复：browser_open 打开 ${fixture}/home，browser_tabs action=open 打开 ${fixture}/work，browser_observe 确认 Entry work，再 bot_send_message 回复实际标题和 URL。不要点击或输入。`,
        );
        for (const name of ['browser_open', 'browser_tabs', 'browser_observe', 'bot_send_message'])
          successful(run.rows, name);
        const v = await view(bot);
        assert.equal(v.tabs.length, 2);
        assert.equal(v.tabs.find((t) => t.current)?.url, `${fixture}/work`);
        bot.home = v.tabs.find((t) => t.url === `${fixture}/home`).targetId;
        bot.work = v.focused;
      } else {
        const tabs = (await view(bot)).tabs;
        await change(
          bot,
          tabs.some((t) => t.url === `${fixture}/work`) ? 'select' : 'open',
          `${fixture}/work`,
        );
        const v = await view(bot);
        assert.equal(v.tabs.length, 2);
        bot.home = v.tabs.find((t) => t.url === `${fixture}/home`).targetId;
        bot.work = v.focused;
      }
      save({ ...state, phase: 'ready' });
      console.log('Real model restored work for matching before/after capture.');
    } else if (mode === '--select-home') {
      await change(bot, 'select', `${fixture}/home`);
      save({ ...state, phase: 'home', realModelSelectedHome: true });
      console.log('Real model selected home; verify Follow on tracks it.');
    } else if (mode === '--open-new') {
      assert.equal(state.phase, 'home');
      const v = await change(bot, 'open', `${fixture}/next`);
      bot.next = v.focused;
      save({ ...state, bot, phase: 'next', realModelOpenedNext: true });
      console.log('Real model opened next; verify Follow off retains home preview.');
    } else if (mode === '--preview-task') {
      assert.equal(state.phase, 'next');
      assert.equal((await view(bot)).focused, bot.next);
      const rows = (
        await model(
          bot,
          'Human 正在预览另一个标签。请在你的当前工作标签完成任务：browser_observe 确认 Entry next；browser_type 输入 Task token 为 CURRENT-NEXT；browser_click 点击 Complete task；browser_observe 确认 Completed: 1；bot_send_message 回复实际完成结果。不要切换或打开标签。',
        )
      ).rows;
      for (const name of ['browser_observe', 'browser_type', 'browser_click', 'bot_send_message'])
        successful(rows, name);
      assert.deepEqual((await server()).receipts, [{ page: 'next', token: 'CURRENT-NEXT' }]);
      assert.equal((await view(bot)).focused, bot.next);
      save({ ...state, phase: 'task', previewDidNotRedirectBotTask: true });
      console.log('Real model completed current-next task while Human previewed home.');
    } else {
      assert.equal(state.phase, 'task');
      const v = await view(bot);
      assert.equal(v.tabs.length, 3);
      assert.equal(v.focused, bot.next);
      assert.deepEqual((await server()).receipts, [{ page: 'next', token: 'CURRENT-NEXT' }]);
      assert.ok(process.env.BH_E2E_UI_RESULTS && process.env.BH_E2E_RESULTS);
      const ui = JSON.parse(readFileSync(process.env.BH_E2E_UI_RESULTS, 'utf8'));
      for (const check of [
        'headerOffLocked',
        'headerOnExpands',
        'headerOffCollapses',
        'collapsedSwitchVisible',
        'followSelect',
        'followOffRetained',
        'followResume',
        'clickPreview',
        'currentPinned',
        'titlesAndUrls',
        'lightAndDark',
        'noHintCopy',
        'pauseResume',
      ])
        assert.equal(ui[check], true, check);
      const report = {
        modelInitialTabs: state.modelInitialTabs,
        realModelSelectedHome: state.realModelSelectedHome,
        realModelOpenedNext: state.realModelOpenedNext,
        previewDidNotRedirectBotTask: state.previewDidNotRedirectBotTask,
        receipts: (await server()).receipts,
        ui,
      };
      writeFileSync(process.env.BH_E2E_RESULTS, JSON.stringify(report, null, 2) + '\n');
      save({ ...state, phase: 'completed' });
      console.log(JSON.stringify(report));
    }
  }
}
