import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.argv[2] ?? 4488);
const minutes = Number(process.argv[3] ?? 60);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !Number.isFinite(minutes) ||
  minutes < 1 ||
  minutes > 180
) {
  throw new Error(
    'Usage: node scripts/computer-input-fixture.mjs [port:1024..65535] [minutes:1..180]',
  );
}
const html = await readFile(new URL('./fixtures/computer-input.html', import.meta.url));
const server = createServer((request, response) => {
  if ((request.method !== 'GET' && request.method !== 'HEAD') || request.url !== '/') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(request.method === 'HEAD' ? undefined : html);
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      url: `http://localhost:${port}/`,
      expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    }),
  ),
);
const timeout = setTimeout(() => {
  server.close();
  server.closeAllConnections();
}, minutes * 60_000);
server.on('close', () => clearTimeout(timeout));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
