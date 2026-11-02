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
    '--restore',
    '--concurrency',
    '--cold-start',
    '--tasks',
    '--closed',
    '--idle',
    '--complete',
  ].includes(mode),
);
const port = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32019);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const fixture = `http://127.0.0.1:${port}`;
if (mode === '--serve') {
  const receipts = [];
  const serial = [];
  const barrier = new Map();
  const parallel = [];
  createServer(async (req, res) => {
    const url = new URL(req.url, fixture);
    if (url.pathname === '/state') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ receipts, serial, parallel }));
    }
    if (url.pathname === '/confirm' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const value = JSON.parse(body);
      assert.ok(['a', 'b'].includes(value.bot));
      assert.ok(['BOT-A', 'BOT-B', 'RECOVERED-A'].includes(value.token));
      receipts.push({ bot: value.bot, token: value.token });
      return res.end(
        JSON.stringify({ completed: receipts.filter((r) => r.bot === value.bot).length }),
      );
    }
    const [, bot, page] = url.pathname.split('/');
    if (!['a', 'b'].includes(bot)) {
      res.statusCode = 404;
      return res.end();
    }
    if (page === 'barrier') {
      parallel.push({ bot, start: Date.now() });
      barrier.set(bot, res);
      if (barrier.size === 2) {
        for (const [key, response] of barrier)
          response.end(
            `<!doctype html><title>Parallel ${key}</title><h1>Both Bot requests arrived concurrently</h1>`,
          );
        barrier.clear();
      } else {
        const timer = setTimeout(() => {
          if (barrier.get(bot) === res) {
            barrier.delete(bot);
            res.statusCode = 503;
            res.end('Second Bot did not arrive concurrently');
          }
        }, 5000);
        res.on('close', () => clearTimeout(timer));
      }
      return;
    }
    if (page?.startsWith('serial-')) {
      const entry = { page, start: Date.now() };
      serial.push(entry);
      if (page === 'serial-first') await new Promise((resolve) => setTimeout(resolve, 400));
      entry.end = Date.now();
      return res.end(`<!doctype html><title>${page}</title><h1>Serialized action ${page}</h1>`);
    }
    const title =
      page === 'home'
        ? `Human workbench ${bot.toUpperCase()}`
        : page === 'spare'
          ? `Disposable spare ${bot.toUpperCase()}`
          : `Background Bot ${bot.toUpperCase()} work`;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><title>${title}</title><body style="font:24px sans-serif;background:white;color:#111;padding:32px"><h1>${title}</h1><p>Separate owned tabs on the shared Bot Browser</p>${page === 'home' ? '<label>Human note <input aria-label="Human note" style="font:24px sans-serif"></label><p id="note">Human may keep typing here while Bots work in other tabs.</p><script>document.querySelector("input").oninput=e=>document.querySelector("#note").textContent="Human note: "+e.target.value;</script>' : page === 'spare' ? '<p>Disposable tab for close and ownership QA.</p>' : `<label>Task token <input aria-label="Task token" style="font:24px sans-serif"></label><p><button style="font:24px sans-serif">Complete task</button></p><p id="receipt">Loading receipt</p><script>async function refresh(){const s=await(await fetch('/state')).json();const r=s.receipts.filter(r=>r.bot==='${bot}');document.querySelector('#receipt').textContent='Completed: '+r.length+'; Last token: '+(r.at(-1)?.token||'none')}document.querySelector('button').onclick=async()=>{await fetch('/confirm',{method:'POST',body:JSON.stringify({bot:'${bot}',token:document.querySelector('input').value})});await refresh()};refresh();</script>`}</body>`,
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
  const native = (bot, name, args = {}) =>
    route('browser-queue-qa', { sessionId: bot.sessionId, name, args });
  const view = (bot) => route(`browser/observation?slug=${encodeURIComponent(bot.slug)}`);
  const server = async () => (await fetch(`${fixture}/state`)).json();
  const text = (r) =>
    r.content
      .filter((v) => v.type === 'text')
      .map((v) => v.text)
      .join('\n');
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
  const setCurrent = async (bot, url) => {
    assert.equal((await native(bot, 'browser_open', { url })).isError, false);
  };
  async function shot(bot, path) {
    const v = await view(bot);
    assert.ok(v.frame?.startsWith('data:image/jpeg;base64,'));
    writeFileSync(path, Buffer.from(v.frame.split(',')[1], 'base64'));
  }
  if (mode === '--prepare') {
    const bots = [];
    for (const key of ['a', 'b']) {
      const bot = (await api('create', { displayName: `Tabs QA ${key.toUpperCase()}` })).bot;
      const dm = (await api('channelDm', { slug: bot.slug })).channel;
      await api('browserAccessSet', { slug: bot.slug, enabled: true });
      const extra = key === 'a' ? `再 browser_tabs action=open 打开 ${fixture}/a/spare；` : '';
      await api('channelSend', {
        channelId: dm.id,
        body: `本地多标签 QA：browser_open 打开 ${fixture}/${key}/home；browser_tabs action=open 打开 ${fixture}/${key}/work；${extra}browser_tabs action=list，再 select 标题与 URL 都匹配 work 页的 targetId（不要选 home 页），标题 Background Bot ${key.toUpperCase()} work，browser_observe，bot_send_message 回复实际标签列表和当前标题。只打开、选择、观察，不输入、不点击。`,
      });
      const sessionId = await until(
        async () =>
          (await api('sessions', { slug: bot.slug })).sessions.find(
            (s) => s.role === 'orchestrator',
          )?.sessionId,
        Boolean,
        'Session missing',
      );
      bots.push({ key, slug: bot.slug, channelId: dm.id, sessionId });
    }
    save({ phase: 'approval', bots });
    console.log('Approve the exact synthetic Browser opening once for each Bot, then --ready.');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const [a, b] = state.bots;
    if (mode === '--cold-start') {
      const logs = () => route('computer/logs?plugin=browser&limit=1000');
      for (const bot of state.bots)
        assert.equal((await route('browser/stop', { slug: bot.slug })).ok, true);
      const prior = Math.max(0, ...(await logs()).entries.map((r) => r.id));
      const opened = await Promise.all(
        state.bots.map((bot) => native(bot, 'browser_open', { url: `${fixture}/${bot.key}/home` })),
      );
      assert.ok(
        opened.every((r) => !r.isError),
        'Both registered consumers must share a successful cold startup',
      );
      const lifecycle = (await logs()).entries.filter(
        (r) => r.id > prior && r.kind === 'lifecycle',
      );
      assert.equal(lifecycle.filter((r) => /\[default\] launch /.test(r.detail)).length, 1);
      assert.equal(lifecycle.filter((r) => /\[default\] ready/.test(r.detail)).length, 1);
      save({ ...state, sharedStartupSingleLaunch: true });
      console.log(
        'Concurrent registered cold consumers shared exactly one Browser launch and connection.',
      );
    } else if (mode === '--restore') {
      const runs = await Promise.all(
        state.bots.map((bot) =>
          model(
            bot,
            `本地 QA 恢复准备：先 browser_open 打开 ${fixture}/${bot.key}/home，再 browser_tabs list，然后用 browser_tabs close 关闭列表中你自己的所有已有标签；browser_open 打开 ${fixture}/${bot.key}/home；browser_tabs open 打开 ${fixture}/${bot.key}/work；${bot.key === 'a' ? `browser_tabs open 打开 ${fixture}/a/spare；` : ''}browser_tabs list；选择 URL 完全等于 ${fixture}/${bot.key}/work 的 targetId（绝对不要选择 /home），browser_observe 确认 Background Bot ${bot.key.toUpperCase()} work，再 bot_send_message 回复当前 URL 和标题。不要输入或点击。`,
          ),
        ),
      );
      for (const run of runs)
        for (const name of ['browser_open', 'browser_tabs', 'browser_observe', 'bot_send_message'])
          successful(run.rows, name);
      save({ ...state, phase: 'approval' });
      console.log('Real model setup restored; run --ready to assert the selected work tabs.');
    } else if (mode === '--ready') {
      assert.equal(state.phase, 'approval');
      await Promise.all(
        state.bots.map(async (bot) => {
          const rows = await until(
            () => events(bot),
            (rows) => rows.some((e) => e.type === 'turn/end'),
            'Real model setup incomplete',
          );
          for (const name of [
            'browser_open',
            'browser_tabs',
            'browser_observe',
            'bot_send_message',
          ])
            successful(rows, name);
          const v = await view(bot);
          assert.equal(v.tabs.length, bot.key === 'a' ? 3 : 2);
          bot.work = v.tabs.find((t) => t.url === `${fixture}/${bot.key}/work`)?.targetId;
          bot.home = v.tabs.find((t) => t.url === `${fixture}/${bot.key}/home`)?.targetId;
          assert.ok(bot.work && bot.home);
          assert.equal(v.focused, bot.work);
        }),
      );
      assert.ok(
        (await view(a)).tabs.every(
          (t) => !(state.bots[1].work === t.targetId || state.bots[1].home === t.targetId),
        ),
      );
      save({ ...state, phase: 'ready' });
      console.log('Real models created and selected 3 A / 2 B owned background tabs.');
    } else if (mode === '--concurrency') {
      assert.equal(state.phase, 'ready');
      const prior = await server();
      const pair = await Promise.all([
        native(a, 'browser_open', { url: `${fixture}/a/barrier` }),
        native(b, 'browser_open', { url: `${fixture}/b/barrier` }),
      ]);
      assert.ok(pair.every((r) => !r.isError));
      const parallel = (await server()).parallel.slice(prior.parallel.length);
      assert.equal(parallel.length, 2);
      assert.deepEqual(new Set(parallel.map((r) => r.bot)), new Set(['a', 'b']));
      const same = await Promise.all([
        native(a, 'browser_open', { url: `${fixture}/a/serial-first` }),
        native(a, 'browser_open', { url: `${fixture}/a/serial-second` }),
      ]);
      assert.ok(same.every((r) => !r.isError));
      const serial = (await server()).serial.slice(prior.serial.length);
      assert.equal(serial.length, 2);
      assert.equal(serial[0].page, 'serial-first');
      assert.equal(serial[1].page, 'serial-second');
      assert.ok(serial[1].start >= serial[0].end);
      const foreign = await native(a, 'browser_tabs', { action: 'select', targetId: b.work });
      assert.equal(foreign.isError, true);
      assert.match(text(foreign), /not owned/);
      await setCurrent(a, `${fixture}/a/work`);
      await setCurrent(b, `${fixture}/b/work`);
      save({
        ...state,
        phase: 'concurrency',
        parallelBarrierPassed: true,
        sameBotSerialized: true,
        foreignTargetRefused: true,
      });
      console.log(
        'Registered two-Bot tools passed rendezvous; same-Bot navigation serialized and foreign ownership refused.',
      );
    } else if (mode === '--tasks') {
      assert.equal(state.phase, 'concurrency');
      const prior = await server();
      const runs = await Promise.all(
        state.bots.map((bot) =>
          model(
            bot,
            `在当前后台工作页完成任务：browser_observe，browser_type 输入 Task token 为 BOT-${bot.key.toUpperCase()}，browser_click 点击 Complete task，browser_wait ms=500，browser_observe 确认 Completed: 1，然后 bot_send_message 回复实际完成数量和 token。不要切换、打开或关闭标签。`,
          ),
        ),
      );
      for (const r of runs)
        for (const name of [
          'browser_observe',
          'browser_type',
          'browser_click',
          'browser_wait',
          'bot_send_message',
        ])
          successful(r.rows, name);
      assert.ok(
        Math.max(...runs.map((r) => r.start)) < Math.min(...runs.map((r) => r.end)),
        'Real DM turns must overlap',
      );
      const added = (await server()).receipts.slice(prior.receipts.length);
      assert.equal(added.length, 2);
      assert.deepEqual(
        new Set(added.map((r) => r.bot + ':' + r.token)),
        new Set(['a:BOT-A', 'b:BOT-B']),
      );
      for (const bot of state.bots) {
        const r = await native(bot, 'browser_observe');
        assert.equal(r.isError, false);
        assert.match(text(r), /Completed: 1/);
        assert.match(text(r), new RegExp(`BOT-${bot.key.toUpperCase()}`));
      }
      save({ ...state, phase: 'tasks', parallelModelTasks: true, completedPerBot: 1 });
      console.log(
        'Overlapping real model DMs completed one owned background task each. Capture Human foreground before/after; close A current tab externally, then --closed.',
      );
    } else if (mode === '--closed') {
      assert.equal(state.phase, 'tasks');
      const closed = await native(a, 'browser_observe');
      assert.equal(closed.isError, true);
      assert.match(text(closed), /tab is gone.*browser_tabs.*browser_open/s);
      const recovered = await model(
        a,
        `Human 已关闭刚才当前标签。用 browser_tabs action=open 新开 ${fixture}/a/recovered，再 browser_observe，输入 Task token 为 RECOVERED-A，点击 Complete task，browser_wait ms=500，再观察并 bot_send_message 回复实际 Completed: 2 和 token。`,
      );
      for (const name of [
        'browser_tabs',
        'browser_observe',
        'browser_type',
        'browser_click',
        'bot_send_message',
      ])
        successful(recovered.rows, name);
      const v = await view(a);
      assert.notEqual(v.focused, a.work);
      assert.equal(v.tabs.length, 3);
      assert.ok(!v.tabs.some((t) => t.targetId === a.work));
      const receipt = (await server()).receipts.filter((r) => r.bot === 'a');
      assert.equal(receipt.length, 2);
      assert.equal(receipt.at(-1).token, 'RECOVERED-A');
      a.work = v.focused;
      save({
        ...state,
        phase: 'closed',
        externalClosedTabRefused: true,
        closedTabError: text(closed),
        realModelRecoveredNewTab: true,
      });
      console.log(
        'Externally closed current target refused readably; real model recovered on a new owned tab.',
      );
    } else if (mode === '--idle') {
      assert.equal(state.phase, 'closed');
      const logs = () => route('computer/logs?plugin=browser&limit=1000');
      const before = (await logs()).entries.filter(
        (r) => r.kind === 'lifecycle' && /\[default\] ready/.test(r.detail),
      ).length;
      const baseline = Math.max(0, ...(await logs()).entries.map((r) => r.id));
      assert.equal((await view(a)).tabs.length, 3);
      const start = Date.now();
      let expired;
      while (Date.now() - start < 110000) {
        const peer = await view(b);
        assert.equal(peer.running, true);
        assert.equal(peer.focused, b.work);
        assert.equal(peer.tabs.length, 2);
        assert.ok(peer.frame);
        const entries = (await logs()).entries;
        if (
          entries.some(
            (r) =>
              r.id > baseline &&
              r.kind === 'lifecycle' &&
              r.detail === `idle tabs closed slug=${a.slug}`,
          )
        ) {
          expired = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      assert.ok(expired, 'Idle A tabs must close within one-minute timeout + sweep');
      const av = await view(a),
        bv = await view(b);
      assert.equal(av.tabs.length, 0);
      assert.equal(bv.tabs.length, 2);
      assert.equal(bv.running, true);
      assert.equal(bv.focused, b.work);
      assert.equal(
        (await logs()).entries.filter(
          (r) => r.kind === 'lifecycle' && /\[default\] ready/.test(r.detail),
        ).length,
        before,
        'Shared Browser must not restart',
      );
      save({
        ...state,
        phase: 'idle',
        idleBotTabsClosed: true,
        activePeerRetained: true,
        sharedBrowserNotRestarted: true,
        idleElapsedMs: Date.now() - start,
      });
      console.log('Idle A tabs closed while B remained active in the same running Browser.');
    } else {
      assert.equal(state.phase, 'idle');
      assert.equal(state.humanFocusRetained, true);
      assert.equal(state.sharedStartupSingleLaunch, true);
      const rows = (
        await model(
          a,
          `browser_tabs action=open 打开 ${fixture}/a/recovered，再 browser_observe，browser_screenshot，bot_send_message 回复实际 Completed: 2 和 RECOVERED-A。不要再次输入或点击。`,
        )
      ).rows;
      for (const name of [
        'browser_tabs',
        'browser_observe',
        'browser_screenshot',
        'bot_send_message',
      ])
        successful(rows, name);
      const all = await native(a, 'browser_tabs', { action: 'list' });
      assert.equal(all.isError, false);
      const opened = await native(a, 'browser_tabs', { action: 'open', url: `${fixture}/a/spare` });
      assert.equal(opened.isError, false);
      const spare = (await view(a)).focused;
      assert.ok(spare);
      assert.equal(
        (await native(a, 'browser_tabs', { action: 'close', targetId: spare })).isError,
        false,
      );
      const left = (await view(a)).tabs;
      assert.equal(left.length, 1);
      assert.equal(
        (await native(a, 'browser_tabs', { action: 'select', targetId: left[0].targetId })).isError,
        false,
      );
      const audit = (await route('computer/logs?plugin=browser&limit=1000')).entries.filter(
        (r) => r.kind === 'browser-action',
      );
      for (const bot of state.bots) {
        assert.ok(
          audit.some(
            (r) =>
              r.detail.includes(`bot=${bot.slug}`) &&
              r.detail.includes(`session=${bot.sessionId}`) &&
              r.detail.includes('browser_tabs'),
          ),
        );
      }
      assert.ok(
        process.env.BH_E2E_RESULTS &&
          process.env.BH_E2E_SCREENSHOT_A &&
          process.env.BH_E2E_SCREENSHOT_B,
      );
      await shot(a, process.env.BH_E2E_SCREENSHOT_A);
      await shot(b, process.env.BH_E2E_SCREENSHOT_B);
      const report = {
        realModelInitialTabs: [3, 2],
        parallelBarrierPassed: state.parallelBarrierPassed,
        sharedStartupSingleLaunch: state.sharedStartupSingleLaunch === true,
        sameBotSerialized: state.sameBotSerialized,
        foreignTargetRefused: state.foreignTargetRefused,
        parallelModelTasks: state.parallelModelTasks,
        completedPerBot: state.completedPerBot,
        externalClosedTabRefused: state.externalClosedTabRefused,
        actualClosedTabError: state.closedTabError,
        humanFocusRetained: state.humanFocusRetained === true,
        realModelRecoveredNewTab: state.realModelRecoveredNewTab,
        idleBotTabsClosed: state.idleBotTabsClosed,
        activePeerRetained: state.activePeerRetained,
        sharedBrowserNotRestarted: state.sharedBrowserNotRestarted,
        idleElapsedMs: state.idleElapsedMs,
        nativeTabCloseVerified: true,
        auditAttributed: true,
      };
      writeFileSync(process.env.BH_E2E_RESULTS, JSON.stringify(report, null, 2) + '\n');
      save({ ...state, phase: 'completed' });
      console.log(JSON.stringify(report));
    }
  }
}
