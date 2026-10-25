import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2];
const port = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32022);
const fixture = 'http://127.0.0.1:' + port;
assert.ok(
  [
    '--serve',
    '--prepare',
    '--login-default',
    '--verify-default',
    '--shared',
    '--login-work',
    '--parallel',
    '--confirm-parallel',
    '--idle',
    '--resume',
    '--complete',
  ].includes(mode),
);
if (mode === '--serve') {
  const logins = [],
    arrivals = [],
    receipts = [],
    waiting = [];
  const accountOf = (req) =>
    /(?:^|;\s*)bh497_account=([a-z]+)/u.exec(req.headers.cookie ?? '')?.[1] ?? 'none';
  createServer(async (req, res) => {
    const url = new URL(req.url, fixture);
    const account = accountOf(req);
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/state') return res.end(JSON.stringify({ logins, arrivals, receipts }));
    if (url.pathname === '/login' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      assert.ok(['shared', 'work'].includes(input.account));
      logins.push({ account: input.account });
      res.setHeader(
        'set-cookie',
        'bh497_account=' + input.account + '; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
      );
      return res.end(JSON.stringify({ account: input.account }));
    }
    if (url.pathname === '/finish' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      assert.ok(['a', 'b'].includes(input.bot));
      assert.equal(account, input.bot === 'a' ? 'work' : 'shared');
      assert.equal(input.token, input.bot.toUpperCase() + '-PARALLEL');
      assert.ok(!arrivals.some((r) => r.bot === input.bot));
      arrivals.push({ bot: input.bot, account, token: input.token });
      waiting.push({ res, receipt: { bot: input.bot, account, token: input.token } });
      if (waiting.length === 2) {
        for (const entry of waiting) {
          receipts.push(entry.receipt);
          entry.res.end(JSON.stringify({ completed: true, account: entry.receipt.account }));
        }
        waiting.length = 0;
      }
      return;
    }
    if (!['/account', '/task/a', '/task/b'].includes(url.pathname)) {
      res.statusCode = 404;
      return res.end();
    }
    const bot = url.pathname.split('/').at(-1);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const login =
      '<label>Account <input aria-label="Account"></label><p><button id="login">Sign in</button></p><script>document.querySelector("#login").onclick=async()=>{await fetch("/login",{method:"POST",body:JSON.stringify({account:document.querySelector("input").value})});location.reload()};</script>';
    const task =
      '<label>Task token <input aria-label="Task token"></label><p><button id="finish">Complete parallel task</button></p><p id="result">Completed: 0</p><script>document.querySelector("#finish").onclick=async()=>{document.querySelector("#result").textContent="Waiting for other profile";const r=await(await fetch("/finish",{method:"POST",body:JSON.stringify({bot:' +
      JSON.stringify(bot) +
      ',token:document.querySelector("input").value})})).json();document.querySelector("#result").textContent="Completed: 1; account: "+r.account};</script>';
    res.end(
      '<!doctype html><title>Profile ' +
        (url.pathname === '/account' ? 'account' : 'task ' + bot.toUpperCase()) +
        '</title><style>body{font:24px sans-serif;padding:32px;color:#111;background:white}input,button{font:24px sans-serif}</style><h1>Profile ' +
        (url.pathname === '/account' ? 'account' : 'task ' + bot.toUpperCase()) +
        '</h1><p>Signed in as: ' +
        account +
        '</p>' +
        (account === 'none'
          ? login
          : url.pathname === '/account'
            ? '<p>Login persists in this browser profile.</p>'
            : task),
    );
  }).listen(port, '127.0.0.1');
} else {
  const home = process.env.BH_E2E_HOME,
    origin = process.env.BH_E2E_ORIGIN,
    statePath = process.env.BH_E2E_STATE;
  assert.ok(home && origin && statePath);
  const cookie = readFileSync(join(tmpdir(), 'dsh-' + basename(home) + '.cookies'), 'utf8').split(
    ';',
  )[0];
  const save = (state) =>
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  async function route(path, body) {
    const r = await fetch(origin + '/api/' + path, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { cookie, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(r.ok, true);
    return r.json();
  }
  async function rpc(ns, name, args = {}) {
    const r = await route(ns + '/' + name, {
      type: 'client-request',
      rpcId: 'profiles-' + Date.now() + '-' + Math.random(),
      method: ns + '/' + name,
      payload: { args },
    });
    assert.equal(r.result?.ok, true, JSON.stringify(r.result?.error));
    return r.result.value;
  }
  const api = (name, args) => rpc('botharness', name, args);
  const view = (bot) => route('browser/observation?slug=' + encodeURIComponent(bot.slug));
  const server = async () => (await fetch(fixture + '/state')).json();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function events(bot) {
    const p = await rpc('session', 'projections', { request: { sessionId: bot.sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId: bot.sessionId },
        throughSeq: p.asOfSeq,
        maxMessages: 100,
      },
    });
    return page.records.filter((r) => r.type === 'event').map((r) => r.event);
  }
  function successful(rows, name) {
    const calls = new Map(
      rows.filter((r) => r.type === 'tool/call').map((r) => [r.data.callId, r.data]),
    );
    const result = rows.find(
      (r) =>
        r.type === 'tool/result' &&
        calls.get(r.data.message.toolCallId)?.name === name &&
        !r.data.message.isError,
    );
    assert.ok(result, name + ' must actually succeed');
    return result.data.message;
  }
  function observed(rows, text) {
    const calls = new Map(
      rows.filter((r) => r.type === 'tool/call').map((r) => [r.data.callId, r.data]),
    );
    assert.ok(
      rows.some(
        (r) =>
          r.type === 'tool/result' &&
          calls.get(r.data.message.toolCallId)?.name === 'browser_observe' &&
          !r.data.message.isError &&
          JSON.stringify(r.data.message).includes(text),
      ),
      'Actual observation must contain ' + text,
    );
  }
  function processes() {
    return execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
      .split('\n')
      .filter(
        (line) =>
          line.includes('--user-data-dir=' + join(home, 'botharness')) && !line.includes('--type='),
      )
      .map((line) => ({
        pid: Number(line.trim().split(/\s+/u)[0]),
        profile: line.includes('/browser-profiles/work') ? 'work' : 'default',
      }));
  }
  if (mode === '--prepare') {
    const bots = {};
    for (const [key, name] of [
      ['a', 'Profile Work QA'],
      ['b', 'Profile Default QA'],
      ['c', 'Profile Shared QA'],
    ]) {
      const bot = (await api('create', { displayName: name })).bot;
      const dm = (await api('channelDm', { slug: bot.slug })).channel;
      bots[key] = { slug: bot.slug, channelId: dm.id };
    }
    assert.deepEqual(processes(), []);
    save({ phase: 'prepared', bots, noLaunchAtBoot: true });
    console.log(
      'Enable Browser for all three Bots and assign work to Work QA through the Client combobox.',
    );
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const { bots } = state;
    async function model(bot, body) {
      const prior = bot.sessionId ? Math.max(0, ...(await events(bot)).map((e) => e.seq)) : 0;
      await api('channelSend', { channelId: bot.channelId, body });
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline) {
        if (!bot.sessionId)
          bot.sessionId = (await api('sessions', { slug: bot.slug })).sessions.find(
            (s) => s.role === 'orchestrator',
          )?.sessionId;
        if (bot.sessionId) {
          save(state);
          const rows = (await events(bot)).filter((r) => r.seq > prior);
          if (rows.some((r) => r.type === 'turn/end')) return rows;
        }
        await Promise.all(Object.values(bots).map(view));
        await delay(1000);
      }
      throw Error('Real model did not finish; approve only the synthetic local opening in its DM.');
    }
    async function login(bot, account) {
      const rows = await model(
        bot,
        '本地 browser profile QA：browser_open 打开 ' +
          fixture +
          '/account；browser_observe 确认 Signed in as: none；输入 Account 为 ' +
          account +
          '，点击 Sign in；再 browser_observe 确认 Signed in as: ' +
          account +
          '，bot_send_message 回复实际结果。这只是本地合成登录，无真实凭据。',
      );
      for (const name of [
        'browser_open',
        'browser_observe',
        'browser_type',
        'browser_click',
        'bot_send_message',
      ])
        successful(rows, name);
      observed(rows, 'Signed in as: none');
      observed(rows, 'Signed in as: ' + account);
      assert.deepEqual((await server()).logins.at(-1), { account });
      const v = await view(bot);
      assert.equal(v.tabs.length, 1);
      return v;
    }
    if (mode === '--login-default') {
      const list = (await api('list')).bots;
      for (const [key, bot] of Object.entries(bots)) {
        const record = list.find((b) => b.slug === bot.slug);
        assert.equal(record.browserAccess, true);
        assert.equal(record.browserProfile ?? '', key === 'a' ? 'work' : '');
      }
      assert.deepEqual(processes(), []);
      await login(bots.b, 'shared');
      assert.deepEqual(
        processes().map((p) => p.profile),
        ['default'],
      );
      state.lazyAssignments = true;
      state.phase = 'default-login';
      save(state);
      console.log('Default signed in once; work profile still has not launched.');
    } else if (mode === '--verify-default') {
      const rows = await events(bots.b);
      for (const name of [
        'browser_open',
        'browser_observe',
        'browser_type',
        'browser_click',
        'bot_send_message',
      ])
        successful(rows, name);
      observed(rows, 'Signed in as: none');
      observed(rows, 'Signed in as: shared');
      assert.deepEqual((await server()).logins, [{ account: 'shared' }]);
      assert.deepEqual(
        processes().map((p) => p.profile),
        ['default'],
      );
      state.lazyAssignments = true;
      state.phase = 'default-login';
      save(state);
      console.log('Verified original successful login after excluding Chrome child processes.');
    } else if (mode === '--shared') {
      const rows = await model(
        bots.c,
        '本地共享 profile QA：browser_open 打开 ' +
          fixture +
          '/account；browser_observe 确认 Signed in as: shared，bot_send_message 回复结果。不要点击或输入；不要重新登录。',
      );
      for (const name of ['browser_open', 'browser_observe', 'bot_send_message'])
        successful(rows, name);
      assert.equal(
        rows.some(
          (r) => r.type === 'tool/call' && ['browser_click', 'browser_type'].includes(r.data.name),
        ),
        false,
      );
      observed(rows, 'Signed in as: shared');
      assert.equal((await server()).logins.length, 1);
      assert.deepEqual(
        processes().map((p) => p.profile),
        ['default'],
      );
      const b = await view(bots.b),
        c = await view(bots.c);
      assert.equal(b.tabs.length, 1);
      assert.equal(c.tabs.length, 1);
      assert.notEqual(b.focused, c.focused);
      state.sharedDefaultLogin = true;
      state.phase = 'shared';
      save(state);
      console.log('Second default Bot reused login, with its own owned tab.');
    } else if (mode === '--login-work') {
      await login(bots.a, 'work');
      assert.deepEqual((await server()).logins, [{ account: 'shared' }, { account: 'work' }]);
      assert.deepEqual(
        processes()
          .map((p) => p.profile)
          .sort(),
        ['default', 'work'],
      );
      state.independentLogins = true;
      state.phase = 'work-login';
      save(state);
      console.log('Work signed in independently; two actual browser instances.');
    } else if (mode === '--parallel') {
      const started = Date.now();
      const runs = await Promise.all(
        ['a', 'b'].map(async (key) => {
          const body =
            '本地并行 profile QA：browser_tabs action=open 打开 ' +
            fixture +
            '/task/' +
            key +
            '；browser_observe 确认账号 ' +
            (key === 'a' ? 'work' : 'shared') +
            '；输入 Task token 为 ' +
            key.toUpperCase() +
            '-PARALLEL；点击 Complete parallel task；两个页面各自计数一次，只有两边都提交服务器才返回；观察 Completed: 1（每页不会变成 2），必要时重复 browser_observe；bot_send_message 回复实际账号和完成结果。不要切换 profile。';
          const rows = await model(bots[key], body);
          for (const name of [
            'browser_tabs',
            'browser_observe',
            'browser_type',
            'browser_click',
            'bot_send_message',
          ])
            successful(rows, name);
          observed(rows, 'Completed: 1');
          return key;
        }),
      );
      assert.deepEqual(runs, ['a', 'b']);
      assert.deepEqual(
        (await server()).receipts.slice().sort((a, b) => a.bot.localeCompare(b.bot)),
        [
          { bot: 'a', account: 'work', token: 'A-PARALLEL' },
          { bot: 'b', account: 'shared', token: 'B-PARALLEL' },
        ],
      );
      for (const key of ['a', 'b'])
        assert.equal(
          (await view(bots[key])).tabs.find((t) => t.current)?.url,
          fixture + '/task/' + key,
        );
      state.parallelProfiles = true;
      state.parallelDurationMs = Date.now() - started;
      state.phase = 'parallel';
      save(state);
      console.log('Both concurrent real models completed their profile-specific barrier tasks.');
    } else if (mode === '--confirm-parallel') {
      assert.equal(state.phase, 'parallel');
      const rows = await model(
        bots.b,
        '澄清本地夹具：A 与 B 页面各自计数一次，服务器收到两边提交才返回，所以每页 Completed: 1 已证明双侧任务完成，不会变成 2。请 browser_observe 复核当前 B 页面 Signed in as: shared 和 Completed: 1，bot_send_message 简短回复实际结果；不要点击或输入。',
      );
      successful(rows, 'browser_observe');
      successful(rows, 'bot_send_message');
      observed(rows, 'Completed: 1');
      assert.equal((await server()).receipts.length, 2);
      save(state);
      console.log('Model confirmed the per-page result after fixture semantics clarification.');
    } else if (mode === '--idle') {
      assert.equal(state.phase, 'parallel');
      const before = processes();
      assert.equal(before.length, 2);
      const workPid = before.find((p) => p.profile === 'work').pid;
      const defaultPid = before.find((p) => p.profile === 'default').pid;
      const current = (await view(bots.b)).focused;
      const start = Date.now();
      let stopped = false;
      while (Date.now() - start < 125000) {
        await view(bots.b);
        const p = processes();
        assert.ok(p.some((r) => r.pid === defaultPid));
        if (!p.some((r) => r.pid === workPid)) {
          stopped = true;
          break;
        }
        await delay(2000);
      }
      assert.equal(stopped, true, 'work profile did not idle-stop');
      const b = await view(bots.b);
      assert.equal(b.running, true);
      assert.equal(b.focused, current);
      const a = await view(bots.a);
      assert.equal(a.running, false);
      assert.equal(a.tabs.length, 0);
      state.independentIdleStop = true;
      state.idleStopElapsedMs = Date.now() - start;
      state.phase = 'idle';
      save(state);
      console.log(
        'Work idle-stopped independently; the same default process/current tab stayed live.',
      );
    } else if (mode === '--resume') {
      assert.equal(state.phase, 'idle');
      const rows = await model(
        bots.a,
        '本地 profile 重启 QA：browser_open 打开 ' +
          fixture +
          '/account，browser_observe 确认 Signed in as: work；bot_send_message 回复实际结果。不要重新登录，不要点击或输入。',
      );
      for (const name of ['browser_open', 'browser_observe', 'bot_send_message'])
        successful(rows, name);
      observed(rows, 'Signed in as: work');
      assert.equal((await server()).logins.length, 2);
      assert.deepEqual(
        processes()
          .map((p) => p.profile)
          .sort(),
        ['default', 'work'],
      );
      state.persistentLoginAfterIdle = true;
      state.phase = 'resumed';
      save(state);
      console.log('Work restarted on demand and kept its persistent login.');
    } else {
      assert.equal(state.phase, 'resumed');
      const ui = JSON.parse(readFileSync(process.env.BH_E2E_UI_RESULTS, 'utf8'));
      for (const name of [
        'createWork',
        'selectExisting',
        'returnDefault',
        'typingDoesNotSave',
        'assignmentVisible',
        'lightAndDark',
      ])
        assert.equal(ui[name], true, name);
      const report = {
        noLaunchAtBoot: state.noLaunchAtBoot,
        lazyAssignments: state.lazyAssignments,
        sharedDefaultLogin: state.sharedDefaultLogin,
        independentLogins: state.independentLogins,
        parallelProfiles: state.parallelProfiles,
        independentIdleStop: state.independentIdleStop,
        persistentLoginAfterIdle: state.persistentLoginAfterIdle,
        parallelDurationMs: state.parallelDurationMs,
        idleStopElapsedMs: state.idleStopElapsedMs,
        ...(await server()),
        ui,
      };
      for (const name of [
        'noLaunchAtBoot',
        'lazyAssignments',
        'sharedDefaultLogin',
        'independentLogins',
        'parallelProfiles',
        'independentIdleStop',
        'persistentLoginAfterIdle',
      ])
        assert.equal(report[name], true, name);
      writeFileSync(process.env.BH_E2E_RESULTS, JSON.stringify(report, null, 2) + '\n');
      state.phase = 'completed';
      save(state);
      console.log(JSON.stringify(report));
    }
  }
}
