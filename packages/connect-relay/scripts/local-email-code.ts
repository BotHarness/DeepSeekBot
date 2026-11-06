import { createServer } from 'node:http';

import { createEmailCode } from '../src/email-code.js';
import { createRelay } from '../src/relay.js';
import type { D1Database } from '../src/d1.js';
import type { TunnelApi } from '../src/cloudflare.js';
import { workosCredential } from '../../../scripts/workos-secret.mjs';

const environment = process.argv[2] ?? 'staging';
const port = Number(process.argv[3] ?? 8787);
const credential = workosCredential(environment) as
  | { clientId: string; apiKey: string }
  | undefined;
if (!credential) {
  console.error(
    `No ${environment} WorkOS credential; run scripts/workos-secret.mjs set ${environment}`,
  );
  process.exit(1);
}

const relay = createRelay({
  db: {} as D1Database,
  verifier: { verify: async () => undefined },
  tunnels: {} as TunnelApi,
  clientId: credential.clientId,
  zone: 'deepseekbot.dev',
  allowedUsers: [],
  maxHosts: 5,
  maxTunnels: 900,
  reclaimAfterMs: 60_000,
  emailCode: createEmailCode({ apiKey: credential.apiKey, clientId: credential.clientId }),
});

createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const response = await relay.fetch(
      new Request(`http://localhost:${port}${incoming.url}`, {
        method: incoming.method ?? 'GET',
        headers: { 'user-agent': incoming.headers['user-agent'] ?? 'local' },
        ...(body && incoming.method !== 'GET' ? { body } : {}),
      }),
    );
    console.log(`${incoming.method} ${incoming.url} -> ${response.status}`);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(`${incoming.method} ${incoming.url} failed`, error);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Local Connect relay (${environment}, email-code only) on http://127.0.0.1:${port}`),
);
