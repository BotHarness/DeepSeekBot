import type { IncomingMessage, ServerResponse } from 'node:http';

export function requestListener(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<unknown>,
): (request: IncomingMessage, response: ServerResponse) => void;
