import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { WebSocket } from 'ws';

const PROTOCOL_V2 = 'botharness-private-v2';
const CHANNEL = '/botharness-device/channel';
const token = () => randomBytes(32).toString('hex');

export async function runConformance({ origin, keyA, keyB, log = () => {} }) {
  const results = [];
  const sockets = [];
  const check = async (name, run) => {
    try {
      await run();
      results.push({ name, ok: true });
      log(`ok ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
      log(`not ok ${name}: ${error.message}`);
    }
  };
  const expect = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const claim = (key, body) =>
    fetch(`${origin}/claim`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const ws = origin.replace(/^http/u, 'ws');
  const open = async (path, headers) => {
    const socket = new WebSocket(ws + path, { headers, followRedirects: false });
    sockets.push(socket);
    const [event] = await Promise.race([
      once(socket, 'open').then(() => ['open']),
      once(socket, 'unexpected-response').then(() => ['refused']),
      once(socket, 'error').then(() => ['refused']),
    ]);
    return event === 'open' ? socket : undefined;
  };
  const next = (socket, ms = 3000) =>
    Promise.race([
      once(socket, 'message').then(([data]) => data.toString()),
      new Promise((resolve) => setTimeout(() => resolve(undefined), ms)),
    ]);
  const a = { owner: token(), phone: token() };
  const b = { owner: token(), phone: token() };
  let hostA, hostB, phoneA, phoneB;
  try {
    await check('health advertises v2', async () => {
      const response = await fetch(`${origin}/health`, { redirect: 'error' });
      const value = await response.json();
      expect(response.ok, `status ${response.status}`);
      expect(Array.isArray(value.protocols) && value.protocols.includes(PROTOCOL_V2), 'no v2');
    });
    await check('unknown claim key is refused', async () => {
      const response = await claim(token(), { ownerToken: token(), phoneToken: token() });
      expect(response.status === 403, `status ${response.status}`);
    });
    await check('competing claims for one Host key: exactly one wins', async () => {
      const rival = { owner: token(), phone: token() };
      const responses = await Promise.all([
        claim(keyA, { ownerToken: a.owner, phoneToken: a.phone }),
        claim(keyA, { ownerToken: rival.owner, phoneToken: rival.phone }),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses[0] === 200 && statuses[1] === 409, `statuses ${statuses.join(',')}`);
      if (responses[1].status === 200) Object.assign(a, rival);
    });
    await check('replayed claim is refused', async () => {
      const response = await claim(keyA, { ownerToken: a.owner, phoneToken: a.phone });
      expect(response.status === 409, `status ${response.status}`);
    });
    await check('second Host claims its own key', async () => {
      const response = await claim(keyB, { ownerToken: b.owner, phoneToken: b.phone });
      expect(response.status === 200, `status ${response.status}`);
    });
    await check('phone token cannot act as a Host', async () => {
      expect(!(await open('/host', { Authorization: `Bearer ${a.phone}` })), 'accepted');
    });
    await check('Host A connects', async () => {
      hostA = await open('/host', { Authorization: `Bearer ${a.owner}` });
      expect(hostA, 'refused');
    });
    await check('a second control socket for Host A is refused', async () => {
      expect(!(await open('/host', { Authorization: `Bearer ${a.owner}` })), 'accepted');
    });
    await check('phone for an offline Host is refused', async () => {
      expect(!(await open(CHANNEL, { Authorization: `Bearer ${b.phone}` })), 'accepted');
    });
    await check('Host B connects', async () => {
      hostB = await open('/host', { Authorization: `Bearer ${b.owner}` });
      expect(hostB, 'refused');
    });
    await check('phone A reaches only Host A', async () => {
      const toA = next(hostA);
      const toB = next(hostB, 800);
      phoneA = await open(CHANNEL, { Authorization: `Bearer ${a.phone}` });
      expect(phoneA, 'refused');
      const opened = JSON.parse((await toA) ?? '{}');
      expect(opened.type === 'open' && /^[a-f0-9]{32}$/u.test(opened.id), 'no open on A');
      expect((await toB) === undefined, 'Host B saw phone A');
      const inbound = next(hostA);
      phoneA.send('opaque-a');
      const data = JSON.parse((await inbound) ?? '{}');
      expect(data.type === 'data' && data.id === opened.id && data.data === 'opaque-a', 'data');
      const outbound = next(phoneA);
      hostA.send(JSON.stringify({ type: 'data', id: opened.id, data: 'reply-a' }));
      expect((await outbound) === 'reply-a', 'reply');
    });
    await check('phone B admits with X-BotHarness-Admission and reaches only Host B', async () => {
      const toB = next(hostB);
      const toA = next(hostA, 800);
      phoneB = await open(CHANNEL, { 'X-BotHarness-Admission': b.phone });
      expect(phoneB, 'refused');
      expect(JSON.parse((await toB) ?? '{}').type === 'open', 'no open on B');
      expect((await toA) === undefined, 'Host A saw phone B');
    });
    await check('Host A disconnect closes only phone A', async () => {
      const closed = once(phoneA, 'close');
      hostA.close();
      await closed;
      const outbound = next(phoneB);
      const toB = next(hostB);
      phoneB.send('still-b');
      const data = JSON.parse((await toB) ?? '{}');
      expect(data.data === 'still-b', 'phone B lost');
      hostB.send(JSON.stringify({ type: 'data', id: data.id, data: 'reply-b' }));
      expect((await outbound) === 'reply-b', 'reply B');
    });
    await check('Host A releases its claim without touching Host B', async () => {
      const response = await fetch(`${origin}/claim`, {
        method: 'DELETE',
        redirect: 'error',
        headers: { Authorization: `Bearer ${a.owner}` },
      });
      expect(response.status === 200, `status ${response.status}`);
      expect(!(await open('/host', { Authorization: `Bearer ${a.owner}` })), 'A still admitted');
      const replay = await claim(keyA, { ownerToken: token(), phoneToken: token() });
      expect(replay.status === 409, `released key reused: ${replay.status}`);
      expect(phoneB.readyState === WebSocket.OPEN, 'phone B closed');
    });
  } finally {
    for (const socket of sockets) socket.terminate();
  }
  return { ok: results.every((result) => result.ok), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      origin: { type: 'string' },
      'key-a-file': { type: 'string' },
      'key-b-file': { type: 'string' },
    },
  });
  if (!values.origin || !values['key-a-file'] || !values['key-b-file']) {
    console.error(
      'Usage: node conformance.mjs --origin https://relay.example.com --key-a-file <file> --key-b-file <file>\nUse two unused Host claim keys. The run claims both and releases Host A.',
    );
    process.exitCode = 2;
  } else {
    const result = await runConformance({
      origin: values.origin.replace(/\/$/u, ''),
      keyA: readFileSync(values['key-a-file'], 'utf8').trim(),
      keyB: readFileSync(values['key-b-file'], 'utf8').trim(),
      log: (line) => console.log(line),
    });
    console.log(result.ok ? 'conformance: pass' : 'conformance: fail');
    process.exitCode = result.ok ? 0 : 1;
  }
}
