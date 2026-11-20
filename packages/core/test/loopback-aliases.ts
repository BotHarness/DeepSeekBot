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
