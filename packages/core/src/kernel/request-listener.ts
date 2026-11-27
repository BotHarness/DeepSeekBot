import type { IncomingMessage, ServerResponse } from 'node:http';

export function requestListener(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    handler(request, response).catch(() => response.destroy());
  };
}
