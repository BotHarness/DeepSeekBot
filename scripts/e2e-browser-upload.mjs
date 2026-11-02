import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2];
assert.ok(
  ['--serve', '--prepare', '--ready', '--restore', '--baseline', '--complete'].includes(mode),
);
const port = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32020);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const fixture = `http://127.0.0.1:${port}`;
const payload = 'Synthetic upload acceptance proof\n';
const digest = createHash('sha256').update(payload).digest('hex');
if (mode === '--serve') {
  const receipts = [];
  createServer(async (req, res) => {
    const url = new URL(req.url, fixture);
    if (url.pathname === '/state') return res.end(JSON.stringify({ receipts }));
    if (url.pathname === '/submit' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const target = body.match(/name="target"; filename="([^"]*)"/)?.[1];
      const other = body.match(/name="other"; filename="([^"]*)"/)?.[1];
      const kind = url.searchParams.get('kind');
      if (target !== 'qa-upload.txt' || other !== '' || !body.includes(payload)) {
        res.statusCode = 400;
        return res.end('Incorrect upload field or bytes');
      }
      const receipt = { kind, target, other, bytes: Buffer.byteLength(payload), sha256: digest };
      receipts.push(receipt);
      return res.end(JSON.stringify(receipt));
    }
    const kind = url.pathname.slice(1);
    if (!['chooser', 'direct', 'empty'].includes(kind)) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><title>Upload acceptance ${kind}</title><body style="font:22px sans-serif;padding:30px;background:#fff;color:#111"><h1>Upload acceptance ${kind}</h1><form><section style="padding:24px;border:2px solid #555;margin:20px 0"><h2>Target document</h2>${kind === 'empty' ? 'No file input on this page' : `<input type="file" name="target" aria-label="Target document" ${kind === 'chooser' ? 'hidden' : ''}>${kind === 'chooser' ? '<button type="button" id="attach">Attach document</button>' : ''}`}</section>${kind === 'empty' ? '' : '<section style="padding:24px;border:2px solid #999;margin:20px 0"><h2>Other attachment</h2><input type="file" name="other" aria-label="Other attachment"></section>'}<p id="state">Target: none; Other: none; Completed: 0</p><button id="submit" disabled>Submit document</button><label style="display:block;margin-top:24px">Continue editing <input aria-label="Continue editing" name="note"></label></form><style>button,input{font:22px sans-serif;padding:10px}</style><script>const form=document.querySelector('form'),target=form.elements.target,other=form.elements.other,submit=document.querySelector('#submit');let completed=0;const refresh=()=>{document.querySelector('#state').textContent='Target: '+(target?.files[0]?.name||'none')+'; Other: '+(other?.files[0]?.name||'none')+'; Completed: '+completed;submit.disabled=!target?.files.length||completed>0};document.querySelector('#attach')?.addEventListener('click',()=>target.click());form.addEventListener('change',refresh);form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;const r=await fetch('/submit?kind=${kind}',{method:'POST',body:new FormData(form)});if(!r.ok)throw Error('Incorrect upload');completed++;refresh()});</script></body>`,
    );
  }).listen(port, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath);
  const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
    ';',
  )[0];
  const save = (s) => writeFileSync(statePath, `${JSON.stringify(s, null, 2)}\n`, { mode: 0o600 });
  async function route(path, args) {
    const response = await fetch(`${origin}/api/${path}`, {
      headers: { cookie, 'content-type': 'application/json' },
      ...(args === undefined ? {} : { method: 'POST', body: JSON.stringify(args) }),
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true, path);
    return response.json();
  }
  async function rpc(namespace, method, args) {
    const { result } = await route(`${namespace}/${method}`, {
      type: 'client-request',
      rpcId: `upload-${Date.now()}-${Math.random()}`,
      method: `${namespace}/${method}`,
      payload: { args },
    });
    assert.equal(result?.ok, true, JSON.stringify(result?.error));
    return result.value;
  }
  const api = (m, a) => rpc('botharness', m, a);
  const native = (s, name, args = {}) =>
    route('browser-queue-qa', { sessionId: s.sessionId, name, args });
  const textOf = (r) =>
    r.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  const view = (s) => route(`browser/observation?slug=${encodeURIComponent(s.slug)}`);
  async function events(s) {
    const p = await rpc('session', 'projections', { request: { sessionId: s.sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId: s.sessionId },
        throughSeq: p.asOfSeq,
        maxMessages: 100,
      },
    });
    return page.records.filter((r) => r.type === 'event').map((r) => r.event);
  }
  function results(rows) {
    const calls = new Map(
      rows
        .filter((r) => r.type === 'tool/call')
        .map((r) => [
          r.data.callId,
          {
            ...r.data,
            arguments:
              typeof r.data.arguments === 'string'
                ? JSON.parse(r.data.arguments)
                : r.data.arguments,
          },
        ]),
    );
    return rows
      .filter((r) => r.type === 'tool/result')
      .map((r) => ({ call: calls.get(r.data.message.toolCallId), message: r.data.message }));
  }
  function success(rows, name) {
    const r = results(rows).find((r) => r.call?.name === name && !r.message.isError);
    assert.ok(r, `${name} must succeed in the real model turn`);
    return r;
  }
  async function until(read, test) {
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const v = await read();
      if (test(v)) return v;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw Error('QA timed out');
  }
  async function model(s, body) {
    const prior = Math.max(0, ...(await events(s)).map((r) => r.seq));
    await api('channelSend', { channelId: s.channelId, body });
    return (
      await until(
        () => events(s),
        (rows) => rows.some((r) => r.seq > prior && r.type === 'turn/end'),
      )
    ).filter((r) => r.seq > prior);
  }
  async function observe(s) {
    const r = await native(s, 'browser_observe');
    assert.equal(r.isError, false);
    return textOf(r);
  }
  async function shot(s, name) {
    const dir = process.env.BH_E2E_ASSETS;
    assert.ok(dir);
    mkdirSync(dir, { recursive: true });
    const v = await view(s);
    assert.match(v.frame, /^data:image\/jpeg;base64,/);
    writeFileSync(join(dir, name), Buffer.from(v.frame.split(',')[1], 'base64'));
  }
  const logs = async () => (await route('computer/logs?plugin=browser&limit=1000')).entries;
  const server = async () => (await fetch(`${fixture}/state`)).json();
  if (mode === '--prepare') {
    const bot = (await api('create', { displayName: 'Upload acceptance QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('channelSend', {
      channelId: dm.id,
      body: `本地文件上传 QA 准备：browser_open 打开 ${fixture}/chooser，然后 browser_observe，bot_send_message 回复标题；这一步不上传、不点击。`,
    });
    const sessionId = await until(
      async () =>
        (await api('sessions', { slug: bot.slug })).sessions.find((s) => s.role === 'orchestrator')
          ?.sessionId,
      Boolean,
    );
    const path = join(home, 'qa-upload.txt');
    writeFileSync(path, payload, { mode: 0o600 });
    save({ slug: bot.slug, channelId: dm.id, sessionId, path });
    console.log('Approve this Bot Browser opening in the real DM; then --ready.');
  } else {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    if (mode === '--restore') {
      const rows = await model(
        s,
        `本地 QA 恢复：browser_open 打开 ${fixture}/chooser，然后 browser_observe，bot_send_message 回复标题；此步不上传、不点击。`,
      );
      for (const n of ['browser_open', 'browser_observe', 'bot_send_message']) success(rows, n);
      console.log('Real model restored Browser permission.');
    } else if (mode === '--ready') {
      const rows = await until(
        () => events(s),
        (rows) => rows.some((r) => r.type === 'turn/end'),
      );
      for (const n of ['browser_open', 'browser_observe', 'bot_send_message']) success(rows, n);
      save({ ...s, ready: true });
      console.log('Real model and Browser authorization verified.');
    } else {
      assert.equal(s.ready, true);
      assert.equal(
        s.complete,
        undefined,
        'Completed QA is retained; use a fresh Profile and fixture',
      );
      assert.equal((await server()).receipts.length, 0, 'Fresh fixture required before upload');
      const prior = Math.max(0, ...(await logs()).map((r) => r.id));
      const findings = {};
      for (const kind of ['chooser', 'direct']) {
        assert.equal(
          (await native(s, 'browser_open', { url: `${fixture}/${kind}` })).isError,
          false,
        );
        let observed = await observe(s);
        if (mode === '--baseline') {
          const ref =
            kind === 'chooser'
              ? observed
                  .split('\n')
                  .find((l) => l.includes('button') && l.includes('Attach document'))
                  ?.match(/(e[\w]+)/)?.[1]
              : undefined;
          if (kind === 'chooser') assert.ok(ref);
          assert.equal(
            (await native(s, 'browser_upload', { path: s.path, ...(ref ? { ref } : {}) })).isError,
            false,
          );
          observed = await observe(s);
          assert.match(observed, /Target: none; Other: qa-upload.txt; Completed: 0/);
          findings[kind] = 'Wrong last field receives attachment';
          await shot(s, `before-${kind}.jpg`);
        } else {
          const rows = await model(
            s,
            `本地合成页面 QA，Human 已授权上传这个测试文件。先 browser_observe，然后 browser_upload path=${s.path} ${kind === 'chooser' ? 'ref 必须使用 Attach document 按钮刚观察到的 ref' : '必须省略 ref 参数，验证默认第一个文件字段'}；再 browser_observe 确认 Target: qa-upload.txt; Other: none; Completed: 0，然后 bot_send_message 回复观察结果。此步只挂附件，不点击 Submit。`,
          );
          const upload = success(rows, 'browser_upload');
          assert.equal(upload.call.arguments.path, s.path);
          if (kind === 'direct') assert.equal(upload.call.arguments.ref, undefined);
          else assert.equal(typeof upload.call.arguments.ref, 'string');
          observed = await observe(s);
          assert.match(observed, /Target: qa-upload.txt; Other: none; Completed: 0/);
          await shot(s, `after-${kind}-attached.jpg`);
          const submitted = await model(
            s,
            'Human 已授权本地提交一次：browser_observe，browser_click 刚观察到的 Submit document 按钮 ref，再 browser_observe 确认 Completed: 1，bot_send_message 回复结果。',
          );
          success(submitted, 'browser_click');
          assert.match(await observe(s), /Target: qa-upload.txt; Other: none; Completed: 1/);
          findings[kind] = 'Real model attached correct field and submitted once';
          await shot(s, `after-${kind}-submitted.jpg`);
        }
      }
      const missing = await native(s, 'browser_upload', { path: join(home, 'missing-upload.txt') });
      assert.equal(missing.isError, true);
      assert.match(textOf(missing), /does not exist/);
      assert.equal((await native(s, 'browser_open', { url: `${fixture}/empty` })).isError, false);
      await observe(s);
      const empty = await native(s, 'browser_upload', { path: s.path });
      assert.equal(empty.isError, true);
      assert.match(textOf(empty), /no file input/);
      const audit = (await logs()).filter(
        (r) => r.id > prior && r.detail.includes(' browser_upload '),
      );
      assert.equal(audit.length, 4);
      const auditJson = JSON.stringify(audit);
      if (mode === '--baseline') {
        assert.ok(auditJson.includes(home), 'Preserve first-failure path leakage evidence');
        findings.audit = 'Missing-file error leaks full Host path';
      } else {
        assert.ok(!auditJson.includes(home) && !auditJson.includes(payload.trim()));
        assert.equal(audit.filter((r) => r.detail.includes(' -> ok ')).length, 2);
        assert.equal(audit.filter((r) => r.detail.includes(' -> error: ')).length, 2);
        assert.ok(
          audit
            .filter((r) => r.detail.includes(' -> ok '))
            .every((r) => r.detail.includes(`bytes=${Buffer.byteLength(payload)}`)),
        );
        const receipts = (await server()).receipts;
        assert.equal(receipts.length, 2);
        assert.deepEqual(
          receipts.map((r) => r.kind),
          ['chooser', 'direct'],
        );
        assert.ok(
          receipts.every(
            (r) =>
              r.target === 'qa-upload.txt' &&
              r.other === '' &&
              r.bytes === Buffer.byteLength(payload) &&
              r.sha256 === digest,
          ),
        );
        findings.audit = 'Basename and size only; failures readable; no full path or bytes';
        findings.receipts = receipts;
      }
      await native(s, 'browser_open', { url: `${fixture}/chooser` });
      await observe(s);
      const report = {
        mode,
        findings,
        missingFileReadable: true,
        noInputReadable: true,
        auditCount: audit.length,
        retainedBrowser: true,
      };
      writeFileSync(
        join(process.env.BH_E2E_ASSETS, `${mode.slice(2)}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      save({ ...s, [mode.slice(2)]: report });
      console.log(JSON.stringify(report));
    }
  }
}
