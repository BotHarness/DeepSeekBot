import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { apply } from './plugin.js';

export function createEnvironmentsContribution() {
  return {
    id: 'environments',
    host: { mountEnvironments: apply },
  } satisfies FeatureContribution<never, never, { mountEnvironments: typeof apply }>;
}
