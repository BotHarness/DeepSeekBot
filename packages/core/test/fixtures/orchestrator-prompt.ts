import { featureContributions } from '../../src/feature-contributions.js';
import type { PromptText } from '../../src/prompts/prompt-parts.js';
import type { AgentFeatureContribution } from '../../src/runtime/agent-feature-context.js';
import { orchestratorPromptSections as compose } from '../../src/runtime/dsh-bot-agent-adapter-orchestrator-prompt.js';

const features: readonly AgentFeatureContribution[] = featureContributions;

export function orchestratorPromptSections(text: PromptText, manager = false) {
  return compose(
    text,
    manager,
    features.flatMap(
      (feature) =>
        feature.promptSections?.({
          promptText: () => text,
          botSlug: 'prompt-test',
          currentRun: () => undefined,
          getAttachments: () => undefined,
        }) ?? [],
    ),
  );
}
