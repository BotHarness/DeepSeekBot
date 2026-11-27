import { randomUUID } from 'node:crypto';
import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { botModelAllowed } from '../../team/models.js';
import type { ModelsBridgeContext } from '../models/contribution.js';
import type { ModelsBridgeDeps } from '../models/deps.js';
import type { PersonaBotsBridgeDeps } from './bridge-deps.js';
import { createPersonaBotsBridgeMethods } from './methods.js';
import { mountRosterCleanup } from './plugin.js';
import { createRuntimeBotContacts } from './runtime-contacts.js';
import { createRuntimeBotCreation } from './runtime-creation.js';
import {
  personabotsRpcMethods,
  personaBotLifecycleRpc,
  personaBotManagementRpc,
  personaBotDeletionRpc,
  personabotStreams,
  rosterSettingsRpc,
} from './rpc.js';

export interface PersonaBotsBridgeContext {
  human: HumanContext;
  deps: PersonaBotsBridgeDeps &
    Pick<ModelsBridgeDeps, 'defaultModel'> & {
      createBotId?: () => string;
    };
  isHostOwner(): boolean;
  runnerOf: Parameters<typeof createPersonaBotsBridgeMethods>[3];
  requireOwnedBot(slug: string): void;
  detailOf: Parameters<typeof createPersonaBotsBridgeMethods>[6];
  sendReceipt(listingId: string): void;
  modelRouting: ModelsBridgeContext['modelRouting'];
}

export function createPersonaBotsContribution() {
  return {
    id: 'personabots',
    bridgeMethods: ({
      human,
      deps,
      isHostOwner,
      runnerOf,
      requireOwnedBot,
      detailOf,
      sendReceipt,
      modelRouting,
    }) => ({
      ...createPersonaBotsBridgeMethods(
        human,
        deps,
        isHostOwner,
        runnerOf,
        (record) =>
          botModelAllowed(
            deps.team,
            record,
            deps.defaultModel?.currentSelection() ?? deps.modelCatalog?.defaultRoute?.(),
          ),
        requireOwnedBot,
        detailOf,
        deps.createBotId ?? (() => 'bot-' + randomUUID().replaceAll('-', '')),
        sendReceipt,
        modelRouting,
      ),
    }),
    rpc: {
      ...personabotsRpcMethods,
      ...personaBotLifecycleRpc,
      ...personaBotManagementRpc,
      ...personaBotDeletionRpc,
      ...rosterSettingsRpc,
    },
    streams: personabotStreams,
    runtimeServices: { createRuntimeBotCreation, createRuntimeBotContacts },
    host: { rosterCleanup: mountRosterCleanup },
  } satisfies FeatureContribution<
    PersonaBotsBridgeContext,
    never,
    { rosterCleanup: typeof mountRosterCleanup }
  >;
}
