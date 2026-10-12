import type { OnboardingSnapshot } from '../../../core/src/onboarding/types.js';
import type { BridgeActions } from './actions.js';

export const CHECKLIST_ITEMS = [
  'model',
  'conversation',
  'memory',
  'im',
  'schedule',
  'companion',
] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];
export type ChecklistTier = 'required' | 'recommended' | 'extra';

export const CHECKLIST_TIER: Record<ChecklistItem, ChecklistTier> = {
  model: 'required',
  conversation: 'required',
  memory: 'recommended',
  im: 'recommended',
  schedule: 'recommended',
  companion: 'extra',
};

export const CHECKLIST_NEEDS_CONVERSATION: ReadonlySet<ChecklistItem> = new Set([
  'memory',
  'im',
  'schedule',
]);

export type ChecklistEvidence = Record<ChecklistItem, boolean>;

export interface ChecklistTarget {
  slug: string;
  channelId: string;
}

export async function loadChecklistEvidence(
  actions: BridgeActions,
  receipt: OnboardingSnapshot,
  target: ChecklistTarget | undefined,
  companionPresent: boolean,
): Promise<ChecklistEvidence> {
  const read = async (load: (target: ChecklistTarget) => Promise<boolean>): Promise<boolean> => {
    if (target === undefined) return false;
    try {
      return await load(target);
    } catch {
      return false;
    }
  };
  const [model, memory, im, schedule] = await Promise.all([
    read(({ slug }) => modelReady(actions, slug)),
    read(({ channelId }) => memoryWritten(actions, channelId)),
    read(async ({ slug }) => {
      const snapshot = await actions.messagingSnapshot(slug);
      return (snapshot.identities?.length ?? 0) > 0 || (snapshot.grants?.length ?? 0) > 0;
    }),
    read(async ({ slug }) => (await actions.botSchedules(slug)).length > 0),
  ]);
  return {
    model,
    conversation: receipt.completed,
    memory,
    im,
    schedule,
    companion: companionPresent,
  };
}

async function modelReady(actions: BridgeActions, slug: string): Promise<boolean> {
  const [{ models, default: fallback }, state] = await Promise.all([
    actions.modelCatalog(),
    actions.modelPlanState(slug),
  ]);
  const route = state.plan?.orchestrator ?? fallback;
  return (
    !state.repair &&
    route !== undefined &&
    models.some(
      (model) =>
        model.provider === route.provider &&
        model.model === route.model &&
        model.credential === undefined,
    )
  );
}

const MEMORY_SCAN_LIMIT = 8;

function memoryPath(path: string): boolean {
  return !path.startsWith('.botharness/') && path !== '.gitattributes';
}

async function memoryWritten(actions: BridgeActions, channelId: string): Promise<boolean> {
  const working = await actions.memoryWorkingChanges(channelId);
  if (working.some((change) => memoryPath(change.path))) return true;
  const commits = (await actions.memoryHistory(channelId))
    .filter((commit) => commit.causeKind === 'source-event')
    .slice(0, MEMORY_SCAN_LIMIT);
  for (const commit of commits) {
    const diff = await actions.memoryGitCommitDiff(channelId, commit.sha);
    if (diff.files.some((file) => memoryPath(file.path))) return true;
  }
  return false;
}

export function checklistDone(evidence: ChecklistEvidence | undefined): number {
  return evidence === undefined ? 0 : CHECKLIST_ITEMS.filter((item) => evidence[item]).length;
}

export function checklistSettled(
  receipt: OnboardingSnapshot | undefined,
  evidence: ChecklistEvidence | undefined,
): boolean {
  if (receipt === undefined) return false;
  if (receipt.tutorial === 'skipped') return true;
  return checklistDone(evidence) === CHECKLIST_ITEMS.length;
}
