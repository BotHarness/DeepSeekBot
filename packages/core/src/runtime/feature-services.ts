import type { createRuntimeInputs } from '../features/approvals/runtime-inputs.js';
import type { createMemoryEvents } from '../features/memory/events.js';
import type { createRuntimeMemoryChanges } from '../features/memory/runtime-changes.js';
import type { pickSessionGroup } from '../features/models/runtime-session-group.js';
import type { createRuntimeBotContacts } from '../features/personabots/runtime-contacts.js';
import type { createRuntimeBotCreation } from '../features/personabots/runtime-creation.js';
import type { createTobCliRuntime } from '../features/tob/cli-runtime.js';

export interface RuntimeFeatureServices {
  createRuntimeInputs: typeof createRuntimeInputs;
  createMemoryEvents: typeof createMemoryEvents;
  createRuntimeMemoryChanges: typeof createRuntimeMemoryChanges;
  pickSessionGroup: typeof pickSessionGroup;
  createRuntimeBotContacts: typeof createRuntimeBotContacts;
  createRuntimeBotCreation: typeof createRuntimeBotCreation;
  createTobCliRuntime: typeof createTobCliRuntime;
}
