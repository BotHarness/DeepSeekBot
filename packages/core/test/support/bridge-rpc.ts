import { OWNER_HUMAN_CONTEXT } from '../../src/humans/context.js';
import { createTestRosterStore } from '../roster-fixture.js';
import { createTestRegistry, registryDatabase } from '../registry-fixture.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { createBridgeMethodsForHumans, type BridgeMethodsDeps } from '../../src/bridge/methods.js';
import { registerBridge } from '../../src/bridge/rpc.js';
import { createSqliteChannelStore } from '../../src/channels/sqlite-store.js';
import { createChannelStore } from '../../src/channels/store.js';
import { createBotStateTracker } from '../../src/state/bot-state.js';
import { attachOperationalModule } from '../../src/database/owner.js';
import { type BotSourcePolicyStore } from '../../src/runtime/source-policy.js';
import { createTestOwnership } from '../helpers.js';

export const roots: string[] = [];

interface BridgeRpcFixture {
  root: string;
  registry: ReturnType<typeof createTestRegistry>;
  channels: ReturnType<typeof createChannelStore>;
  methods: ReturnType<ReturnType<typeof createBridgeMethodsForHumans>>;
  methodsForHuman: ReturnType<typeof createBridgeMethodsForHumans>;
  service: ReturnType<typeof registerBridge>;
}

export function setup(
  sourcePolicy?: BotSourcePolicyStore,
  extras: Pick<
    BridgeMethodsDeps,
    'channelManagement' | 'tob' | 'modelCatalog' | 'routingGroupEngineOptions'
  > = {},
  operational = false,
): BridgeRpcFixture {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-rpc-'));
  roots.push(root);
  const registry = createTestRegistry({ rootDir: root });
  const channels = (operational ? createSqliteChannelStore : createChannelStore)({
    database: attachOperationalModule(registryDatabase(root), 'channels'),
    rootDir: join(root, 'channels'),
    now: () => new Date('2026-09-19T00:00:00.000Z'),
  });
  const methodsForHuman = createBridgeMethodsForHumans({
    registry,
    states: createBotStateTracker(),
    channels,
    ownership: createTestOwnership(),
    roster: createTestRosterStore({ database: registryDatabase(root) }),
    createBotId: () => 'ada',
    ...extras,
    ...(sourcePolicy === undefined ? {} : { sourcePolicy }),
  });
  const methods = methodsForHuman(OWNER_HUMAN_CONTEXT);
  const ctx = new Context().extend({ invocation: { peer: { principal: { kind: 'owner' } } } });
  const service = registerBridge(ctx, methodsForHuman);
  return { root, registry, channels, methods, methodsForHuman, service };
}

export function parameterNames(method: (...args: never[]) => unknown): string[] {
  const source = Function.prototype.toString.call(method);
  const open = source.indexOf('(');
  const close = open === -1 ? -1 : source.indexOf(')', open + 1);
  const parameters = open === -1 || close === -1 ? '' : source.slice(open + 1, close);
  return parameters
    .split(',')
    .map((part) => part.trim().replace(/^\.\.\./, ''))
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter((part) => part.length > 0);
}
