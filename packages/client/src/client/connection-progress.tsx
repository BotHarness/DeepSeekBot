import { useState } from 'react';

import { ActionButton } from './ds/action-button.js';
import { StepProgress } from './ds/step-progress.js';
import type { BotHarnessTranslate } from './locale.js';

const PHONE_PROMPTS = [
  'connections.botPrompt.method',
  'connections.botPrompt.prepare',
  'connections.botPrompt.approve',
] as const;

export function ConnectionProgress({
  step,
  joining = false,
  t,
}: {
  step: number;
  joining?: boolean;
  t: BotHarnessTranslate;
}) {
  const [copied, setCopied] = useState<number>();
  const labels = joining
    ? (['connections.stepLink', 'connections.stepIdentity', 'connections.stepChannels'] as const)
    : (['connections.stepMethod', 'connections.stepPrepare', 'connections.stepApprove'] as const);
  const prompt = joining ? undefined : PHONE_PROMPTS[step];
  return (
    <>
      <StepProgress
        label={t('connections.progress')}
        steps={labels.map((label) => t(label))}
        step={step}
      />
      {prompt === undefined ? null : (
        <div>
          <ActionButton
            icon={copied === step ? 'check' : 'terminal'}
            data-connection-bot-prompt={prompt}
            onClick={() => {
              void navigator.clipboard?.writeText(t(prompt)).then(
                () => setCopied(step),
                () => setCopied(undefined),
              );
            }}
          >
            {t(copied === step ? 'connections.botPrompt.copied' : 'connections.botPrompt.copy')}
          </ActionButton>
        </div>
      )}
    </>
  );
}
