import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectedExecution } from '../src/credentials/protected-execution.js';

const executions: ProtectedExecution[] = [];
afterEach(async () => {
  await Promise.all(executions.splice(0).map((execution) => execution.close()));
});

describe('qualified CLI output boundary', () => {
  it('authenticates a real CLI request while discarding an echoing server body, headers and errors', async () => {
    const canary = 'SYNTHETIC-output-canary-1380';
    let authenticated = false;
    const server = createServer((request, response) => {
      authenticated =
        request.headers['x-api-key'] === canary &&
        request.headers['x-api-secret'] === canary + '-secret';
      response.writeHead(authenticated ? 200 : 401, { 'x-secret-echo': canary });
      response.end(canary + Buffer.from(canary).toString('base64'));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('missing server');
    const execution = new ProtectedExecution(() => undefined);
    executions.push(execution);
    try {
      const result = await execution.authenticatedStatus(
        {
          endpoint: `http://127.0.0.1:${address.port}/private?marker=${canary}`,
          api_key: canary,
          api_secret: canary + '-secret',
        },
        new AbortController().signal,
      );
      expect(authenticated).toBe(true);
      expect(result).toEqual({ consumer: 'http-status-v1', successful: true, httpStatus: 200 });
      expect(JSON.stringify(result)).not.toContain(canary);
      const refused = await execution.authenticatedStatus(
        {
          endpoint: `http://127.0.0.1:${address.port}/private?marker=${canary}`,
          api_key: canary + '-stale',
          api_secret: canary + '-secret',
        },
        new AbortController().signal,
      );
      expect(refused).toEqual({
        consumer: 'http-status-v1',
        successful: false,
        httpStatus: 401,
        action:
          'Replace private information in Web Chat and retry; remote authorization may also need repair.',
      });
      expect(JSON.stringify(refused)).not.toContain(canary);
      await expect(
        execution.authenticatedStatus(
          { endpoint: canary, api_key: canary, api_secret: canary },
          new AbortController().signal,
        ),
      ).rejects.toThrow('The Owner-supplied endpoint is not an https URL');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('http-status-v1 failure reasons', () => {
  it('says why the API could not be reached instead of an opaque failure', async () => {
    const canary = 'SYNTHETIC-status-canary-3340';
    const server = createServer((_request, response) => {
      response.writeHead(302, { location: 'https://example.invalid/next?k=' + canary });
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('missing server');
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const closedAddress = closed.address();
    if (closedAddress === null || typeof closedAddress === 'string')
      throw new Error('missing server');
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const events: Array<[string, object]> = [];
    const execution = new ProtectedExecution((phase, details = {}) => {
      events.push([phase, details]);
    });
    executions.push(execution);
    const secrets = { api_key: canary, api_secret: canary + '-secret' };
    try {
      await expect(
        execution.authenticatedStatus(
          { endpoint: `http://127.0.0.1:${address.port}/`, ...secrets },
          new AbortController().signal,
        ),
      ).rejects.toThrow('The API answered with a redirect');
      await expect(
        execution.authenticatedStatus(
          { endpoint: `http://127.0.0.1:${closedAddress.port}/`, ...secrets },
          new AbortController().signal,
        ),
      ).rejects.toThrow('This Host could not connect to the API');
      const cancelled = new AbortController();
      cancelled.abort();
      await expect(
        execution.authenticatedStatus(
          { endpoint: `http://127.0.0.1:${address.port}/`, ...secrets },
          cancelled.signal,
        ),
      ).rejects.toMatchObject({ reason: 'cancelled' });
      expect(events).toContainEqual([
        'credential-cli-unreachable',
        expect.objectContaining({ program: 'http-status-v1', failure: 'redirect' }),
      ]);
      expect(events).toContainEqual([
        'credential-cli-unreachable',
        expect.objectContaining({ program: 'http-status-v1', failure: 'connection' }),
      ]);
      expect(JSON.stringify(events)).not.toContain(canary);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
