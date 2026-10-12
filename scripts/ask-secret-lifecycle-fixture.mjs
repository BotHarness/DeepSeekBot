import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 31386);
const versions = [
  {
    key: 'SYNTHETIC-1380-key-A',
    secret: 'SYNTHETIC-1380-secret-A',
    marker: 'SYNTHETIC-1380-url-A',
  },
  {
    key: 'SYNTHETIC-1382-key-B',
    secret: 'SYNTHETIC-1382-secret-B',
    marker: 'SYNTHETIC-1382-url-B',
  },
];
let version = 0;
let delayMs = 0;
const evidence = { requests: 0, authenticated: 0, completed: 0, disconnected: 0, versions: [0, 0] };
const timers = new Set();
const server = createServer(async (request, response) => {
  if (request.url === '/evidence') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(evidence));
    return;
  }
  if (request.url === '/control' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1024) {
        request.destroy();
        return;
      }
    }
    try {
      const next = JSON.parse(body);
      if (
        ![0, 1].includes(next.version) ||
        !Number.isInteger(next.delayMs) ||
        next.delayMs < 0 ||
        next.delayMs > 9000
      )
        throw new Error('invalid');
      version = next.version;
      delayMs = next.delayMs;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ version, delayMs }));
    } catch {
      response.writeHead(400);
      response.end('Invalid fixture control');
    }
    return;
  }
  evidence.requests++;
  const expected = versions[version];
  const accepted =
    request.method === 'GET' &&
    request.url === '/status?marker=' + expected.marker &&
    request.headers['x-api-key'] === expected.key &&
    request.headers['x-api-secret'] === expected.secret;
  if (accepted) {
    evidence.authenticated++;
    evidence.versions[version]++;
  }
  let finished = false;
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (response.destroyed) return;
    finished = true;
    evidence.completed++;
    response.writeHead(accepted ? 200 : 401, {
      'content-type': 'text/plain',
      'x-private-echo': expected.key,
    });
    response.end(
      [
        expected.key,
        expected.secret,
        expected.marker,
        Buffer.from(expected.secret).toString('base64'),
      ].join('\n'),
    );
  }, delayMs);
  timers.add(timer);
  response.on('close', () => {
    if (!finished) evidence.disconnected++;
    clearTimeout(timer);
    timers.delete(timer);
  });
});
server.listen(port, '127.0.0.1', () =>
  process.stdout.write(JSON.stringify({ phase: 'ready', port, synthetic: true }) + '\n'),
);
for (const event of ['SIGINT', 'SIGTERM'])
  process.on(event, () => {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  });
