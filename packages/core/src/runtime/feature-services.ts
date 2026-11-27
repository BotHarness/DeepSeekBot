import type { createRuntimeInputs } from '../features/approvals/runtime-inputs.js';
import type { createMemoryEvents } from '../features/memory/events.js';
import type { createRuntimeMemoryChanges } from '../features/memory/runtime-changes.js';
import type { pickSessionGroup } from '../features/models/runtime-session-group.js';
import type { createRuntimeBotContacts } from '../features/personabots/runtime-contacts.js';
import type { createRuntimeBotCreation } from '../features/personabots/runtime-creation.js';
import type { createTobCliRuntime } from '../features/tob/cli-runtime.js';

import type { createDirectTools } from '../features/sessions/direct-tools.js';
import type { createActivityEvents } from '../features/activity/events.js';
import type { createAssignmentDelivery } from '../features/assignments/delivery.js';
import type { createAssignmentReporting } from '../features/assignments/reporting.js';
import type { createAssignmentEvents } from '../features/assignments/events.js';
import type { coalesceInbox, createInboxHarvest } from '../features/activity/inbox-harvest.js';
import type { createAssignmentExecution } from '../features/assignments/runtime-execution.js';
import type { createAssignmentIntake } from '../features/assignments/runtime-intake.js';
import type { createAssignmentRouting } from '../features/assignments/runtime-routing.js';
import type { createRuntimeAdmissions } from '../features/activity/runtime-admissions.js';
import type { createRuntimeAdmissionRecovery } from '../features/activity/runtime-admission-recovery.js';
import type { createOrchestratorTurns } from '../features/sessions/runtime-orchestrator-turns.js';
import type { createOrchestratorSessions } from '../features/sessions/runtime-orchestrator-sessions.js';
import type {
  channelToolFeatures,
  createOrchestratorServices,
  voiceAdmissionNotes,
} from '../features/sessions/runtime-orchestrator-services.js';
import type { createTurnFailures } from '../features/sessions/runtime-turn-failures.js';
import type { interruptedDmNotice } from '../features/activity/runtime-admission-support.js';
import type { createRuntimeAssignmentAccess } from '../features/assignments/runtime-access.js';
import type { createRuntimeAssignmentLifecycle } from '../features/assignments/runtime-lifecycle.js';
import type { createNativeOrchestratorStep } from '../features/sessions/native-orchestrator-step.js';

export interface RuntimeFeatureServices {
  createDirectTools: typeof createDirectTools;
  createActivityEvents: typeof createActivityEvents;
  createAssignmentDelivery: typeof createAssignmentDelivery;
  createAssignmentReporting: typeof createAssignmentReporting;
  createAssignmentEvents: typeof createAssignmentEvents;
  coalesceInbox: typeof coalesceInbox;
  createInboxHarvest: typeof createInboxHarvest;
  createAssignmentExecution: typeof createAssignmentExecution;
  createAssignmentIntake: typeof createAssignmentIntake;
  createAssignmentRouting: typeof createAssignmentRouting;
  createRuntimeAdmissions: typeof createRuntimeAdmissions;
  createRuntimeAdmissionRecovery: typeof createRuntimeAdmissionRecovery;
  createOrchestratorTurns: typeof createOrchestratorTurns;
  createOrchestratorSessions: typeof createOrchestratorSessions;
  channelToolFeatures: typeof channelToolFeatures;
  createOrchestratorServices: typeof createOrchestratorServices;
  voiceAdmissionNotes: typeof voiceAdmissionNotes;
  createTurnFailures: typeof createTurnFailures;
  interruptedDmNotice: typeof interruptedDmNotice;
  createRuntimeAssignmentAccess: typeof createRuntimeAssignmentAccess;
  createRuntimeAssignmentLifecycle: typeof createRuntimeAssignmentLifecycle;
  createNativeOrchestratorStep: typeof createNativeOrchestratorStep;
  createRuntimeInputs: typeof createRuntimeInputs;
  createMemoryEvents: typeof createMemoryEvents;
  createRuntimeMemoryChanges: typeof createRuntimeMemoryChanges;
  pickSessionGroup: typeof pickSessionGroup;
  createRuntimeBotContacts: typeof createRuntimeBotContacts;
  createRuntimeBotCreation: typeof createRuntimeBotCreation;
  createTobCliRuntime: typeof createTobCliRuntime;
}
