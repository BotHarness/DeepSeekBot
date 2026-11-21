import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { runEngineCommand } from '../src/bots/cli-engine.js';
import { createEngineAccountBridge } from '../src/engines/engine-account-bridge.js';
import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';

const verificationUrl = 'https://auth.openai.com/codex/device';

function fixture(body: string) {
  const root = createTempRoot('codex-device-login-');
  const command = join(root, 'fake-codex');
  writeFileSync(command, '#!/bin/sh\nexec node "$0.cjs" "$@"\n', { mode: 0o700 });
  writeFileSync(
    `${command}.cjs`,
    `
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
if (process.argv.slice(2).join(' ') !== 'login --device-auth') process.exit(56);
if (process.env.OPENAI_API_KEY) process.exit(57);
const home = process.env.CODEX_HOME;
${body}
`,
  );
  const accountsChanged = vi.fn();
  const host = new EngineHost({
    root,
    local: true,
    gateway: createEngineGateway(),
    sessions: () => undefined,
    persistence: () => undefined,
    env: { ...process.env, CODEX_HOME: join(root, 'inherited'), OPENAI_API_KEY: 'fixture' },
    codexCommand: command,
    detectCodex: async ({ home }) => ({
      installed: true,
      login: existsSync(join(home, 'signed-in')) ? 'chatgpt' : 'signed-out',
    }),
    accountsChanged,
  });
  const account = host.addAccount('codex', 'Work', 0);
  accountsChanged.mockClear();
  const bridge = createEngineAccountBridge(OWNER_HUMAN_CONTEXT, { engineAccounts: host });
  return { root, host, account, accountsChanged, bridge };
}

it.skipIf(process.platform === 'win32')(
  'reads a colored challenge split across writes and streams, then refreshes the named account',
  async () => {
    const { root, host, account, accountsChanged, bridge } = fixture(`
process.stdout.write('Welcome to Codex [v' + String.fromCharCode(27) + '[90m0.169.0]\\r\\n');
process.stdout.write('   ' + String.fromCharCode(27) + '[94mhttps://auth.openai.com/codex/');
setTimeout(() => {
  process.stdout.write('device' + String.fromCharCode(27) + '[0m\\r\\n');
  process.stderr.write('2. Enter this one-time code (expires in 15 minutes)\\n  ' +
    String.fromCharCode(27) + '[94m7ABC-');
  setTimeout(() => process.stderr.write('92DE' + String.fromCharCode(27) + '[0m\\n'), 40);
}, 40);
setTimeout(() => writeFileSync(join(home, 'signed-in'), ''), 700);
`);
    try {
      const login = await bridge.engineAccountLogin({ id: account.id, mode: 'device-auth' });
      if (!login.ok) throw new Error(JSON.stringify(login.error));
      expect(login.value).toMatchObject({ started: true, engine: 'codex' });
      const read = () =>
        bridge.engineAccountLoginStatus({ id: account.id, attemptId: login.value.attemptId });
      await expect.poll(read).toMatchObject({
        ok: true,
        value: {
          status: 'pending',
          url: verificationUrl,
          code: '7ABC-92DE',
          expiresAt: expect.any(String),
        },
      });
      await expect.poll(read).toEqual({ ok: true, value: { status: 'completed' } });
      expect(accountsChanged).toHaveBeenCalledOnce();
      await expect(host.status(account.id)).resolves.toMatchObject([{ available: true }]);
      await expect(host.status('codex')).resolves.toMatchObject([{ available: false }]);
      expect(existsSync(join(root, 'inherited'))).toBe(false);
    } finally {
      await host.close();
    }
  },
);

it('prints the device challenge once and waits for the Host result for the selected CLI account', async () => {
  vi.useFakeTimers();
  try {
    const attemptId = '7d38c154-2981-431d-83a1-82c400cf6a11';
    const rpc = vi.fn(async (method: string) => {
      if (method === 'engineAccountLogin') return { started: true, engine: 'codex', attemptId };
      if (rpc.mock.calls.length < 4)
        return {
          status: 'pending',
          url: verificationUrl,
          code: '7ABC-92DE',
          expiresAt: '2026-11-22T00:00:00.000Z',
        };
      return { status: 'completed' };
    });
    const progress = vi.fn();
    const running = runEngineCommand(
      'engine-login',
      ['codex'],
      { 'device-auth': true, account: 'codex-work' },
      async () => ({ rpc, http: vi.fn() }),
      undefined,
      progress,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenNthCalledWith(1, 'engineAccountLogin', {
      id: 'codex-work',
      engine: 'codex',
      mode: 'device-auth',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'engineAccountLoginStatus', {
      id: 'codex-work',
      attemptId,
    });
    expect(progress).toHaveBeenCalledWith(expect.stringContaining(`${verificationUrl}\n`));
    expect(progress).toHaveBeenCalledWith(expect.stringContaining('7ABC-92DE'));
    await vi.runAllTimersAsync();
    await expect(running).resolves.toEqual({ engine: 'codex', status: 'completed' });
    expect(progress).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it.skipIf(process.platform === 'win32')(
  'cancels only the specified pending attempt and permits a fresh login',
  async () => {
    const { host, account, bridge } = fixture(`
process.stdout.write('Verification URL: ${verificationUrl}.\\nUser code: 7ABC-92DE\\n');
setInterval(() => {}, 1000);
`);
    try {
      const start = async () => {
        const { attemptId } = await host.login('codex', account.id, 'device-auth');
        if (attemptId === undefined) throw new Error('Missing attempt ID');
        return attemptId;
      };
      const attemptId = await start();
      await expect
        .poll(() => host.deviceLoginStatus(account.id, attemptId))
        .toMatchObject({
          status: 'pending',
          url: verificationUrl,
          code: '7ABC-92DE',
        });
      await expect(host.login('codex', account.id)).rejects.toMatchObject({
        code: 'engine-account-busy',
      });
      await expect(bridge.engineAccountLoginCancel({ id: account.id, attemptId })).resolves.toEqual(
        {
          ok: true,
          value: { cancelled: true },
        },
      );
      expect(host.deviceLoginStatus(account.id, attemptId)).toEqual({ status: 'cancelled' });
      const next = await start();
      await expect(host.cancelLogin(account.id, attemptId)).resolves.toEqual({ cancelled: false });
      expect(() => host.deviceLoginStatus(account.id, attemptId)).toThrow(/no longer available/u);
      await expect(host.cancelLogin(account.id, next)).resolves.toEqual({ cancelled: true });
      expect(host.deviceLoginStatus(account.id, next)).toEqual({ status: 'cancelled' });
    } finally {
      await host.close();
    }
  },
);

it.skipIf(process.platform === 'win32').each([
  ['expired', 'setInterval(() => {}, 1000);'],
  [
    'failed',
    "setTimeout(() => { process.stderr.write('private-provider-output'); process.exitCode = 42; }, 350);",
  ],
  ['failed', "setTimeout(() => { process.stdout.write('unexpected successful exit'); }, 350);"],
] as const)('clears the challenge after a %s subprocess outcome (%#)', async (end, exit) => {
  const { host, account, accountsChanged } = fixture(`
process.stdout.write('<${verificationUrl}>\\nEnter code (expires in 1 second)\\n7ABC-92DE\\n');
${exit}
`);
  try {
    const { attemptId } = await host.login('codex', account.id, 'device-auth');
    if (attemptId === undefined) throw new Error('Missing attempt ID');
    const read = () => host.deviceLoginStatus(account.id, attemptId);
    await expect.poll(read).toMatchObject({ status: 'pending' });
    await expect.poll(read, { timeout: 3000 }).toEqual({ status: end });
    expect(accountsChanged).not.toHaveBeenCalled();
    await expect(host.cancelLogin(account.id, attemptId)).resolves.toEqual({ cancelled: false });
  } finally {
    await host.close();
  }
});

it.skipIf(process.platform === 'win32')(
  'refuses to display a challenge from an unrelated URL',
  async () => {
    const { host, account } = fixture(
      "process.stdout.write('https://auth.openai.com.example/codex/device\\n7ABC-92DE\\n');",
    );
    try {
      const { attemptId } = await host.login('codex', account.id, 'device-auth');
      if (attemptId === undefined) throw new Error('Missing attempt ID');
      await expect
        .poll(() => host.deviceLoginStatus(account.id, attemptId))
        .toEqual({ status: 'failed' });
    } finally {
      await host.close();
    }
  },
);

it('accepts the compact JSON flag at the CLI entry point for Codex device sign-in', async () => {
  const stdout = vi.fn();
  await expect(
    runBotCreateCli(
      ['engine', 'login', 'codex', '--device-auth', '--json', '--host', 'http://127.0.0.1:1'],
      { env: {}, stdout, stderr: vi.fn() },
    ),
  ).resolves.toBe(1);
  expect(stdout).toHaveBeenCalledExactlyOnceWith(
    '{"error":{"code":"host-unauthorized","message":"Set DEEPSEEKBOT_HOST_TOKEN or provide --token-file."}}',
  );
});
