import type { createRuntimeInputs } from '../features/approvals/runtime-inputs.js';
import type { createMemoryEvents } from '../features/memory/events.js';
import type { createRuntimeMemoryChanges } from '../features/memory/runtime-changes.js';

export interface RuntimeFeatureServices {
  createRuntimeInputs: typeof createRuntimeInputs;
  createMemoryEvents: typeof createMemoryEvents;
  createRuntimeMemoryChanges: typeof createRuntimeMemoryChanges;
}
