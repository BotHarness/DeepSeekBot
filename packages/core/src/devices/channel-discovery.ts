import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EncryptionIdentity } from './noise-identity.js';
import type { HostIdentity } from './pairing.js';

export function createChannelDiscovery(options: {
  host(): HostIdentity;
  encryption(): Promise<EncryptionIdentity>;
  passwordSignInAvailable(): boolean;
}) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'GET') {
      response.writeHead(405);
      response.end();
      return;
    }
    try {
      const encryption = await options.encryption();
      const signIn = { password: options.passwordSignInAvailable() };
      const body = JSON.stringify({ host: options.host(), encryption, signIn });
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      response.end(body);
    } catch {
      response.writeHead(503, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify({ code: 'host-key-unavailable' }));
    }
  };
}
