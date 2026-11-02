import { createServer } from 'node:net';

async function canListen(address: string): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, address, () => resolve());
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/**
 * Real-bridge tailnet tests give each simulated Host its own loopback address, because the
 * bridge identifies a peer by its source address. Linux routes all of 127.0.0.0/8 to `lo`;
 * macOS only has 127.0.0.1 unless aliases are added (`sudo ifconfig lo0 alias 127.0.0.N`),
 * so those tests skip there instead of failing with `network-listener-unavailable`.
 */
export async function loopbackAliasesAvailable(addresses: readonly string[]): Promise<boolean> {
  const results = await Promise.all(addresses.map(canListen));
  const missing = addresses.filter((_, index) => !results[index]);
  if (missing.length > 0)
    console.warn(
      `Skipping real-bridge tailnet tests: cannot bind ${missing.join(', ')}. ` +
        'On macOS add them with `sudo ifconfig lo0 alias <address>` to run these tests.',
    );
  return missing.length === 0;
}
