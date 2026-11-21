import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { createChannelStore } from '../src/channels/store.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { PrivateInputs } from '../src/credentials/private-inputs.js';

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
export const declaration = {
  account: 'synthetic',
  purpose: 'Check the controlled service',
  fields: [
    { id: 'api_key', label: 'API key', required: true },
    { id: 'api_secret', label: 'API secret', required: true },
    { id: 'private_url', label: 'Private URL', required: false },
  ],
};
export const values = {
  api_key: 'SYNTHETIC KEY + / canary',
  api_secret: '  SYNTHETIC secret\nkeep whitespace  ',
  private_url: 'http://127.0.0.1/private?canary=synthetic',
};

export async function fixture(
  qualified = true,
  requestTimeoutMs?: number,
  extra: Partial<ConstructorParameters<typeof PrivateInputs>[0]> = {},
) {
  const root = createTempRoot('bh-private-input-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  disposers.push(() => fiber.dispose());
  await fiber.await();
  const credentials = ctx.credentials;
  const registry = createTestRegistry({ rootDir: root });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  registry.create({ slug: 'bea', displayName: 'Bea' });
  const channels = createChannelStore({ rootDir: join(root, 'channels') });
  channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea');
  const ownership = createTestOwnership({
    'ada-session': { botSlug: 'ada', rootRole: 'orchestrator' },
    'bea-session': { botSlug: 'bea', rootRole: 'orchestrator' },
  });
  const agent = { session: { id: 'ada-session' } } as Agent;
  const bea = { session: { id: 'bea-session' } } as Agent;
  let live = true;
  let interactive = true;
  const deps = {
    channels,
    ownership,
    registry,
    credentials: () => credentials,
    isLive: (candidate: Agent) => live && (candidate === agent || candidate === bea),
    canRequest: () => interactive,
    qualified: async () => qualified,
    log: vi.fn(),
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
    ...extra,
  };
  const owner = new PrivateInputs(deps);
  return {
    owner,
    agent,
    bea,
    channels,
    credentials,
    ownership,
    ctx,
    replacement: () => new PrivateInputs(deps),
    unattended: () => {
      interactive = false;
    },
    close: async () => {
      await owner.close();
      registryDatabase(root).close();
    },
    stop: () => {
      live = false;
    },
  };
}

export function origin() {
  const controller = new AbortController();
  let current = true;
  let applies = true;
  return {
    lease: {
      sourceEventId: 'im-source',
      signal: controller.signal,
      current: () => current && !controller.signal.aborted,
      applies: () => applies,
    },
    revoke: () => {
      current = false;
      controller.abort();
    },
    nextTurn: () => {
      applies = false;
    },
  };
}
