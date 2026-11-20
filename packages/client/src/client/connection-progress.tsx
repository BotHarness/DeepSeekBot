import { useState } from 'react';

import { ActionButton } from './ds/action-button.js';
import { Note } from './ds/note.js';
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
  const [copy, setCopy] = useState<{ step: number; ok: boolean }>();
  const labels = joining
    ? (['connections.stepLink', 'connections.stepIdentity', 'connections.stepChannels'] as const)
    : (['connections.stepMethod', 'connections.stepPrepare', 'connections.stepApprove'] as const);
  const prompt = joining ? undefined : PHONE_PROMPTS[step];
  const copied = copy?.step === step && copy.ok;
  const failed = copy?.step === step && !copy.ok;
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
            icon={copied ? 'check' : 'terminal'}
            data-connection-bot-prompt={prompt}
            onClick={() => {
              const clipboard = navigator.clipboard;
              if (clipboard === undefined) {
                setCopy({ step, ok: false });
                return;
              }
              void clipboard.writeText(t(prompt)).then(
                () => setCopy({ step, ok: true }),
                () => setCopy({ step, ok: false }),
              );
            }}
          >
            {t(copied ? 'connections.botPrompt.copied' : 'connections.botPrompt.copy')}
          </ActionButton>
          {failed ? (
            <>
              <Note tone="danger">{t('connections.botPrompt.failed')}</Note>
              <Note>{t(prompt)}</Note>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
