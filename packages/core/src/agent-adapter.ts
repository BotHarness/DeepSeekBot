import {
  createDshBotAgentAdapter as createRuntimeAgentAdapter,
  type DshBotAgentAdapterOptions,
} from './runtime/dsh-bot-agent-adapter.js';
import type { GenuiPreviewDiagnostic } from './runtime/genui-preview.js';
import type { Context } from '@deepseek-ai/cordis';
import { createFeatureContributions } from './feature-contributions.js';

export function createDshBotAgentAdapter(
  options: DshBotAgentAdapterOptions & {
    onGenuiDiagnostic?: (event: GenuiPreviewDiagnostic) => void;
    genuiPreviewBrowserPath?: string;
    genuiAttachmentContext?: Pick<Context, 'get'>;
  },
): ReturnType<typeof createRuntimeAgentAdapter> {
  return createRuntimeAgentAdapter({
    ...options,
    featureContributions:
      options.featureContributions ??
      createFeatureContributions({
        genui: {
          browserPath: options.genuiPreviewBrowserPath,
          onDiagnostic: options.onGenuiDiagnostic,
          getFallbackAttachments: () => options.genuiAttachmentContext?.get('attachments'),
        },
      }),
  });
}
