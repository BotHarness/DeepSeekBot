import { createConnection } from 'node:net';

export interface StalePhoneRoute {
  url: string;
  targetPort: number;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export const probeLoopbackPort = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ready: boolean) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(400);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });

export async function stalePhoneRoutes(
  config: unknown,
  hostname: string,
  currentPort: number,
  probe: (port: number, host: string) => Promise<boolean> = probeLoopbackPort,
): Promise<StalePhoneRoute[]> {
  const candidates: { url: string; host: string; targetPort: number }[] = [];
  for (const [key, site] of Object.entries(record(record(config)['Web'])).slice(0, 64)) {
    if (!key.startsWith(`${hostname}:`)) continue;
    const proxy = record(record(record(site)['Handlers'])['/'])['Proxy'];
    if (typeof proxy !== 'string') continue;
    try {
      const target = new URL(proxy.includes('://') ? proxy : `http://${proxy}`);
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
        target.protocol !== 'http:'
      )
        continue;
      const targetPort = Number(target.port || 80);
      if (targetPort === currentPort) continue;
      const url = new URL(`https://${key}`).origin;
      candidates.push({
        url,
        host: target.hostname === '[::1]' ? '::1' : target.hostname,
        targetPort,
      });
    } catch {}
  }
  const observed = await Promise.all(
    candidates.map(async ({ url, host, targetPort }) =>
      (await probe(targetPort, host)) ? undefined : { url, targetPort },
    ),
  );
  return observed.filter((route): route is StalePhoneRoute => route !== undefined);
}
