import { Context } from '@deepseek-ai/cordis';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createBotCreationController } from '../../../apps/mobile/src/host/bot-creation';
import { botCreationTransport } from '../../../apps/mobile/src/host/bot-creation-transport';
import { createCore } from '../../core/src/plugin';
import { createBridgeMethods } from '../../core/src/bridge/methods';
import { registerBridge } from '../../core/src/bridge/rpc';
import { createTempRoot } from '../../core/test/helpers';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  vi.unstubAllEnvs();
});
function fixture(home = createTempRoot('git-import-receipt-'), warn?: (message: string) => void) {
  const core = createCore({
    dshHome: home,
    ...(warn === undefined ? {} : { warn }),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected model execution');
      },
    },
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  closes.push(close);
  return {
    core,
    home,
    close,
    bridge: createBridgeMethods({ ...core, ...(warn === undefined ? {} : { warn }) }),
  };
}
function repository() {
  const dir = createTempRoot('git-import-source-');
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Import fixture');
  git('config', 'user.email', 'fixture@example.test');
  writeFileSync(join(dir, 'SOUL.md'), 'Immutable source personality.');
  git('add', '.');
  git('commit', '--quiet', '-m', 'source');
  vi.stubEnv('GIT_CONFIG_COUNT', '1');
  vi.stubEnv('GIT_CONFIG_KEY_0', `url.${dir.replaceAll('\\', '/')}/.insteadOf`);
  vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://fixture.example/source.git');
  return { git, dir, url: 'https://fixture.example/source.git', commit: git('rev-parse', 'HEAD') };
}
it.each([undefined, 'marketplace'] as const)(
  'imports %s Git through the real DSH gateway and recovers the same Bot',
  async (origin) => {
    const source = repository();
    const f = fixture();
    const ctx = new Context();
    registerBridge(ctx, f.bridge);
    ctx.provide('typert');
    ctx.set('typert', {
      local: { get: () => undefined, hasSeen: () => false },
      lookups: { definitions: () => [] },
    });
    const gateway = new TypertGatewayService(ctx, {});
    type Peer = Parameters<TypertGatewayService['invoke']>[0]['peer'];
    const peer: Peer = {
      id: 'mobile-import-test' as Peer['id'],
      principal: { kind: 'owner' },
      signal: new AbortController().signal,
      ctx,
      interactions: 'none',
      dispose: async () => {},
    };
    closes.push(async () => {
      await ctx.fiber.dispose();
    });
    const transport = botCreationTransport(
      () => [
        {
          hostId: 'host',
          hostName: 'Host',
          deviceId: 'phone',
          credential: 'test',
          routes: ['https://fixture.ts.net'],
        },
      ],
      {
        async request(_url, init) {
          const request = JSON.parse(String(init.body));
          let result;
          try {
            result = {
              ok: true,
              value: await gateway.invoke({
                namespace: 'botharness',
                method: request.method.split('/')[1],
                args: request.payload.args,
                peer,
              }),
            };
          } catch (error) {
            if (!(error instanceof Error) || !('code' in error)) throw error;
            result = { ok: false, error: { code: error.code, message: error.message } };
          }
          return {
            status: 200,
            text: async () => JSON.stringify({ type: 'server-response', result }),
          };
        },
        openSocket() {
          throw new Error('No live socket needed');
        },
      },
    );
    const controller = createBotCreationController({
      key: () => 'mobile:test-import',
      storage: { read: async () => undefined, write: async () => {} },
      port: transport,
    });
    await controller.enter({ kind: 'host', hostId: 'host' });
    await controller.beginImport({
      gitUrl: source.url,
      displayName: 'Mobile helper',
      ...(origin ? { origin, listingId: 'fixture' } : {}),
    });
    await controller.preview();
    expect(controller.getSnapshot().error).toBeUndefined();
    await controller.submit();
    expect(controller.getSnapshot()).toMatchObject({
      error: undefined,
      receipt: { status: 'created' },
    });
    expect(f.core.registry.list()).toHaveLength(1);
    const receipt = controller.getSnapshot().receipt;
    await controller.submit();
    expect(controller.getSnapshot().receipt).toEqual(receipt);
    expect(f.core.registry.list()).toHaveLength(1);
    expect(f.core.channels.list()).toHaveLength(1);
  },
);
