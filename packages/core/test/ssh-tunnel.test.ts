import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { describe, expect, it } from 'vitest';
import { ConnectChannel } from '../src/devices/noise/channel.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { readSshPairing } from '../src/bots/cli-ssh.js';
import { openSshTunnel, sshTunnelArgs, verifyTunnelHost } from '../src/devices/ssh-tunnel.js';
import { freeLoopbackPort, openSshLoopback } from '../src/devices/ssh-loopback.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const target = {
  alias: 'dev-host',
  localPort: 32451,
  remotePort: 39105,
  hostId: 'host-test',
  hostKey: 'ab'.repeat(32),
};

describe('SSH connection boundary', () => {
  it('routes the public CLI command and returns a coded usage refusal without revealing input', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runBotCreateCli(['ssh-tunnel', 'server'], {
      env: {},
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });
    expect(code).toBe(2);
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toMatchObject({ error: { code: 'usage' } });
  });
  it('discards ambient browser cookies and exposes only the Noise channel', async () => {
    const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const port = await freeLoopbackPort();
    const carrier = await openSshLoopback(port, address.port);
    const seen: unknown[] = [];
    upstream.on('connection', (socket, request) => {
      seen.push({ cookie: request.headers.cookie, authorization: request.headers.authorization });
      socket.on('message', (bytes) => socket.send(bytes.toString()));
    });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`, {
      headers: { cookie: 'unrelated-local-host=ambient-secret' },
    });
    try {
      await once(socket, 'open');
      const reply = once(socket, 'message');
      socket.send('encrypted-frame');
      expect(String((await reply)[0])).toBe('encrypted-frame');
      expect(seen).toEqual([{ cookie: undefined, authorization: undefined }]);
      expect((await fetch(`http://127.0.0.1:${port}/api/botharness/list`)).status).toBe(403);
      for (const request of [
        {
          path: '/botharness-device/channel',
          headers: { authorization: 'Bearer must-not-forward' },
        },
        {
          path: '/botharness-device/channel',
          headers: { 'sec-websocket-protocol': 'must-not-forward' },
        },
        { path: '/botharness-device/channel?query=denied', headers: {} },
        { path: '/api/botharness/list', headers: {} },
      ]) {
        const refused = new WebSocket(`ws://127.0.0.1:${port}${request.path}`, {
          headers: request.headers,
        });
        const [error] = await once(refused, 'error');
        expect(String(error)).toContain('403');
      }
      expect(seen).toHaveLength(1);
    } finally {
      socket.terminate();
      await carrier.close();
      for (const client of upstream.clients) client.terminate();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
  it.each(['-oProxyCommand=bad', 'host;command', 'host name', 'host\ncommand'])(
    'refuses option or shell injection in %j',
    (alias) => {
      expect(() => sshTunnelArgs({ ...target, alias })).toThrow('Use an existing SSH alias');
    },
  );

  it('uses direct forwarding with strict trust and without a remote command', () => {
    const args = sshTunnelArgs(target);
    expect(args.slice(-2)).toEqual(['--', 'dev-host']);
    expect(args).toContain('StrictHostKeyChecking=yes');
    expect(args).toContain('ExitOnForwardFailure=yes');
    expect(args).toContain('127.0.0.1:32451:127.0.0.1:39105');
    expect(args).toContain('-N');
  });

  it.each([true, false])(
    'authenticates a real Noise responder before reporting ready (matching key=%s)',
    async (matches) => {
      const hostKey = randomBytes(32);
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing address');
      const messages: string[] = [];
      server.on('connection', (socket) => {
        const channel = new ConnectChannel({
          role: 'responder',
          hostId: target.hostId,
          staticKey: hostKey,
          ephemeralKey: randomBytes(32),
          hostKey: noisePublicKey(hostKey),
        });
        socket.on('message', (wire) => {
          try {
            const result = channel.receive(wire.toString());
            if (result.reply) socket.send(result.reply);
            if (result.message) messages.push(result.message);
          } catch {
            socket.terminate();
          }
        });
        socket.on('close', () => channel.close());
      });
      try {
        const operation = verifyTunnelHost(
          {
            ...target,
            localPort: address.port,
            hostKey: Buffer.from(noisePublicKey(matches ? hostKey : randomBytes(32))).toString(
              'hex',
            ),
          },
          new AbortController().signal,
        );
        if (matches) expect(await operation).toBe(true);
        else expect(await operation).toBe(false);
        expect(messages).toEqual([]);
        await expect(
          openSshTunnel({
            target: { ...target, localPort: address.port },
            signal: new AbortController().signal,
            log() {},
          }),
        ).rejects.toMatchObject({ code: 'ssh-local-port-unavailable' });
      } finally {
        for (const client of server.clients) client.terminate();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );

  it('carries the original Host pin and offer while marking encrypted loopback explicitly', () => {
    const input = {
      v: 1,
      host: { id: 'remote', name: 'Linux' },
      offer: 'private-offer',
      routes: ['https://old.tailnet.ts.net'],
      expiresAt: '2026-01-01T00:00:00Z',
      encryption: { protocol: 'connect-noise-xk-v1', publicKey: target.hostKey },
    };
    const link = `deepseekbot://pair?p=${Buffer.from(JSON.stringify(input)).toString('base64url')}`;
    const parsed = readSshPairing(link);
    expect(parsed.host).toEqual(input.host);
    expect(parsed.offer).toBe(input.offer);
    expect(parsed.encryption).toMatchObject({ publicKey: target.hostKey, loopback: 'encrypted' });
    expect(parsed.routes).toEqual([]);
    expect(parsed.expiresAt).toBe(input.expiresAt);
    expect(() => readSshPairing(link.replace('deepseekbot:', 'https:'))).toThrow(
      'private pairing file',
    );
    expect(() => readSshPairing('private-secret')).toThrow('Use a private pairing file');
  });
});
