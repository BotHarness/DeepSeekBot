import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createChannelFilesAdapterMethods, type ChannelFilesBridgeDeps } from './methods.js';
import { mountAttachmentRoutes } from './plugin.js';
import { CHANNEL_FILES_PROMPT } from './prompt.js';
import { channelFilesRpcMethods } from './rpc.js';
import { createBridgeAttachmentSaveTool, registerChannelFileTools } from './tools.js';

export interface ChannelFilesAgentContext {
  currentRun: Parameters<typeof registerChannelFileTools>[0];
  getAttachments: Parameters<typeof registerChannelFileTools>[1];
}

export function createChannelFilesContribution() {
  return {
    id: 'channel-files',
    bridgeMethods: ({ deps }) => createChannelFilesAdapterMethods(deps),
    rpc: channelFilesRpcMethods,
    host: { attachmentRoutes: mountAttachmentRoutes },
    promptSections: () => [
      { placement: 'slot', slot: 'channel-files', text: () => CHANNEL_FILES_PROMPT },
    ],
    tools: ({ currentRun, getAttachments }, { register }) => {
      register(createBridgeAttachmentSaveTool(currentRun), 'bridge');
      registerChannelFileTools(currentRun, getAttachments, (tool) =>
        register(tool, 'after-inbox-tools'),
      );
    },
  } satisfies FeatureContribution<
    { deps: ChannelFilesBridgeDeps },
    ChannelFilesAgentContext,
    { attachmentRoutes: typeof mountAttachmentRoutes }
  >;
}
