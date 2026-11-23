import { OWNER_HUMAN_CONTEXT } from '../../src/humans/context.js';
import { createTestRosterStore } from '../roster-fixture.js';
import { createTestRegistry } from '../registry-fixture.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BotModesDeps } from '../../src/bridge/bot-modes.js';
import { createAttachmentStore } from '../../src/attachments/store.js';
import { createBridgeMethods, type BridgeMethodsDeps } from '../../src/bridge/methods.js';
import { createChannelStore, type ChannelStore } from '../../src/channels/store.js';
import type { MemoryService } from '../../src/memory/service.js';
import { type UsageProjection, type DshUsageSessionLogReader } from '../../src/usage/usage.js';
import { createModelPresetStore } from '../../src/models/presets.js';
import type { ModelCatalog } from '../../src/models/catalog.js';
import { createModelRouteReadiness } from '../../src/models/readiness.js';
import { type BotRuntime } from '../../src/runtime/bot-runtime.js';
import type { WorkspaceGrantStore } from '../../src/workspaces/grants.js';
import { createBotStateTracker } from '../../src/state/bot-state.js';
import { createTestOwnership } from '../helpers.js';
import {
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../src/database/schema-plan.js';

export const roots: string[] = [];

export const modelOwners: OperationalDatabaseOwner[] = [];

interface BridgeMethodsFixture {
  root: string;
  registry: ReturnType<typeof createTestRegistry>;
  modelPresets: ReturnType<typeof createModelPresetStore>;
  modelOwner: OperationalDatabaseOwner;
  states: ReturnType<typeof createBotStateTracker>;
  channels: ChannelStore;
  attachments: ReturnType<typeof createAttachmentStore>;
  methods: ReturnType<typeof createBridgeMethods>;
}

export function tickingNow(): () => Date {
  let value = Date.parse('2026-09-19T00:00:00.000Z');
  return () => {
    value += 1000;
    return new Date(value);
  };
}

export function setup(
  _sessionSummaries: unknown[] = [],
  botIds: string[] = ['ada'],
  runtimeFactory?: (channels: ChannelStore) => BotRuntime,
  ownership = createTestOwnership(),
  grants?: WorkspaceGrantStore,
  developerMode?: { set(enabled: boolean): void },
  memory?: MemoryService,
  usage?: UsageProjection,
  modelCatalog?: ModelCatalog,
  readUsageSessionLog?: DshUsageSessionLogReader,
  describeEngineSession?: BridgeMethodsDeps['describeEngineSession'],
  botModes?: BotModesDeps,
  readSessionTitles?: BridgeMethodsDeps['readSessionTitles'],
): BridgeMethodsFixture {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-'));
  roots.push(root);
  const modelOwner = mountOperationalDatabase({
    dshHome: root,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  modelOwners.push(modelOwner);
  const registry = createTestRegistry({ rootDir: root, database: modelOwner });
  const modelPresets = createModelPresetStore({
    rootDir: root,
    database: modelOwner,
  });
  const states = createBotStateTracker();
  const attachments = createAttachmentStore({
    rootDir: join(root, 'attachments'),
  });
  const channels = createChannelStore({
    rootDir: join(root, 'channels'),
    attachments,
    now: tickingNow(),
    isBotActive: (slug) => registry.get(slug) !== undefined && registry.get(slug)?.paused !== true,
    botDisplayName: (slug) => registry.get(slug)?.displayName,
  });
  let botIdIndex = 0;
  return {
    root,
    registry,
    modelPresets,
    modelOwner,
    states,
    channels,
    attachments,
    methods: createBridgeMethods(OWNER_HUMAN_CONTEXT, {
      registry,
      modelPresets,
      ...(modelCatalog === undefined ? {} : { modelCatalog }),
      ...(modelCatalog === undefined
        ? {}
        : {
            modelReadiness: createModelRouteReadiness(registry, modelCatalog),
          }),
      states,
      channels,
      attachments,
      ownership,
      roster: createTestRosterStore(),
      ...(grants === undefined ? {} : { grants }),
      ...(memory === undefined ? {} : { memory }),
      ...(usage === undefined ? {} : { usage }),
      ...(readUsageSessionLog === undefined ? {} : { readUsageSessionLog }),
      ...(describeEngineSession === undefined ? {} : { describeEngineSession }),
      ...(runtimeFactory === undefined ? {} : { runtime: runtimeFactory(channels) }),
      ...(developerMode === undefined ? {} : { developerMode }),
      ...(botModes === undefined ? {} : { botModes }),
      ...(readSessionTitles === undefined ? {} : { readSessionTitles }),
      createBotId: () => botIds[botIdIndex++] ?? 'bot-test-' + botIdIndex,
    }),
  };
}
