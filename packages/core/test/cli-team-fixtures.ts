import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { afterEach, expect, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { requestListener } from './async-listener.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
export async function host(
  memberFailure: {
    code: string;
    message: string;
    details?: { permission?: string; path?: string; spaceId?: string };
  } = {
    code: 'remote-access/denied',
    message: 'member-call-refused',
  },
  policyFailure?: { code: string; message: string },
  failure?: { code: string; details: Record<string, string> },
  memberSuccess?: unknown,
) {
  const calls: Array<{ path: string; input: Record<string, unknown> }> = [];
  const server = createServer(
    requestListener(async (request, response) => {
      if (request.method === 'GET') {
        response
          .writeHead(302, { 'set-cookie': 'authority=test-owner; HttpOnly', location: '/' })
          .end();
        return;
      }
      if (request.headers.cookie !== 'authority=test-owner') {
        response.writeHead(401).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      calls.push({ path: request.url ?? '', input });
      const value =
        input.method === 'botharness/channelGet'
          ? {
              channel: {
                id: input.payload.args.channelId,
                type: 'group',
                name: 'Team',
                members: [],
              },
              policyRevision: 'a'.repeat(64),
              policy: {
                addMembers: 'everyone',
                post: 'everyone',
                mentionAll: 'everyone',
                addBots: 'admins',
                editDetails: 'admins',
              },
            }
          : input.method === 'botharness/teamMode'
            ? fakeTeamMode({ humanId: 'owner-id' })
            : input.method === 'botharness/members'
              ? [
                  { username: 'bob', humanId: 'bob-id' },
                  { username: 'owner', humanId: 'local-human' },
                ]
              : input.method === 'botharness/memberCreate'
                ? {
                    member: { username: 'bob', humanId: 'bob-id' },
                    initialPassword: 'private-initial-password',
                  }
                : input.method === 'botharness/memberPasswordReset'
                  ? { initialPassword: 'private-reset-password' }
                  : { done: true };
      response.setHeader('content-type', 'application/json');
      if (failure) {
        const error = { ...failure, message: failure.code };
        response.end(
          JSON.stringify(
            request.url === '/api/botharness/team-as'
              ? { ok: false, error }
              : { type: 'server-response', rpcId: input.rpcId, result: { ok: false, error } },
          ),
        );
      } else if (request.url === '/api/botharness/team-as')
        response.end(
          JSON.stringify({
            ...(memberSuccess === undefined
              ? { ok: false, error: memberFailure }
              : { ok: true, value: memberSuccess }),
          }),
        );
      else
        response.end(
          JSON.stringify({
            type: 'server-response',
            rpcId: input.rpcId,
            result:
              input.method === 'botharness/channelPolicySet' && policyFailure
                ? { ok: false, error: policyFailure }
                : { ok: true, value },
          }),
        );
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { calls, url: `http://127.0.0.1:${address.port}` };
}
export async function run(url: string, args: string[], stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status = await runBotCreateCli(args, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toContain('private-test-token');
  return {
    status,
    text: stdout.join(''),
    errorText: stderr.join(''),
    output: JSON.parse(stdout.join('')),
  };
}
