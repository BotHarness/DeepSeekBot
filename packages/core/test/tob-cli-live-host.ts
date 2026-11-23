import { createServer, type Server } from 'node:http';
import { afterEach, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { startTobCliBroker, type TobCliBroker } from '../src/tob/cli-broker.js';
import { createTobHostCliOperations, type TobHostCliRunner } from '../src/tob/cli-host-commands.js';
import { requestListener } from './async-listener.js';

export const LAUNCH_TOKEN = 'synthetic-launch-token';
const servers: Server[] = [];
const brokers: TobCliBroker[] = [];

afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

export async function serveHost(handler: (request: Request) => Promise<Response>) {
  const server = createServer(
    requestListener(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/') {
        if (url.searchParams.get('token') !== LAUNCH_TOKEN)
          return void response.writeHead(401).end();
        response.setHeader('set-cookie', 'authority=synthetic; HttpOnly');
        return void response.writeHead(302, { location: '/' }).end();
      }
      if (request.headers.cookie !== 'authority=synthetic')
        return void response.writeHead(401).end();
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const reply = await handler(
        new Request(url, {
          method: request.method ?? 'GET',
          ...(request.method === 'POST' ? { body: new Uint8Array(Buffer.concat(chunks)) } : {}),
        }),
      );
      response.writeHead(reply.status, Object.fromEntries(reply.headers));
      response.end(Buffer.from(await reply.arrayBuffer()));
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  return `http://127.0.0.1:${address.port}`;
}

export interface TobCliResult {
  ok: boolean;
  value?: Record<string, unknown>;
  error?: { code: string };
}

export async function tobCli(origin: string) {
  const run: TobHostCliRunner = async ({ argv, stdin }) => {
    const stdout: string[] = [];
    const exitCode = await runBotCreateCli([...argv], {
      env: { DEEPSEEKBOT_HOST: origin, DEEPSEEKBOT_HOST_TOKEN: LAUNCH_TOKEN },
      stdout: (value) => stdout.push(value),
      stderr: () => {},
      readStdin: async () => stdin,
    });
    return { exitCode, stdout: stdout.join('\n').replaceAll(LAUNCH_TOKEN, '[redacted]') };
  };
  const approve = vi.fn(async (_proposal: unknown) => {});
  const broker = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize: () => {},
    approve,
    readSetting: () => ({ scope: 'global', value: 1, revision: 1 }),
    writeSetting: async () => ({ scope: 'global', value: 1, revision: 1 }),
    prepareOperation: createTobHostCliOperations({ run }),
    capabilities: [],
  });
  brokers.push(broker);
  const transcript: TobCliResult[] = [];
  const invoke = async (argv: string[]): Promise<TobCliResult> => {
    const response = await fetch(broker.endpoint + '/invoke', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + broker.token, 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'cli', args: { argv } }),
    });
    const result = (await response.json()) as TobCliResult;
    transcript.push(result);
    return result;
  };
  const cards = () =>
    approve.mock.calls.map(([proposal]) => (proposal as { command: string }).command);
  return { invoke, approve, cards, transcript };
}
