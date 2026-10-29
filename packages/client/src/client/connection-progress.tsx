import { StepProgress } from './ds/step-progress.js';
import type { BotHarnessTranslate } from './locale.js';

export function ConnectionProgress({
  step,
  joining = false,
  t,
}: {
  step: number;
  joining?: boolean;
  t: BotHarnessTranslate;
}) {
  const labels = joining
    ? (['connections.stepLink', 'connections.stepIdentity', 'connections.stepChannels'] as const)
    : (['connections.stepMethod', 'connections.stepPrepare', 'connections.stepApprove'] as const);
  return (
    <StepProgress
      label={t('connections.progress')}
      steps={labels.map((label) => t(label))}
      step={step}
    />
  );
}
