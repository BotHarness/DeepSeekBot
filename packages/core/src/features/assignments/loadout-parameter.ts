export interface AssignmentModeChoices {
  default: string;
  allowed: Array<{ id: string; name?: string; description?: string }>;
  restricted: boolean;
}

const ASSIGNMENT_LOADOUT_GUIDANCE =
  'A Loadout decides the Assignment’s system prompt and tools, and every tool definition costs input tokens on each step, so choose the lightest allowed Loadout whose description covers the work. The Loadout is fixed once the Assignment starts and a continuity key keeps the existing Assignment’s Loadout: work that needs tools its Loadout lacks goes to a new Assignment under a new key.';

export function assignmentLoadoutParameter(choices: AssignmentModeChoices | undefined): {
  type: 'string';
  description: string;
  enum?: string[];
} {
  if (choices === undefined || choices.allowed.length < 2)
    return {
      type: 'string',
      description: `Optional Loadout id from assignmentLoadouts.allowed in list_assignment_models; omitted uses this Bot’s Loadout (${choices?.default ?? 'unknown'}). ${ASSIGNMENT_LOADOUT_GUIDANCE}`,
    };
  const loadouts = choices.allowed
    .map((loadout) => `- ${loadout.id}: ${loadout.description ?? loadout.name ?? 'no description'}`)
    .join('\n');
  return {
    type: 'string',
    enum: choices.allowed.map((loadout) => loadout.id),
    description: `Optional Loadout for this Assignment; omitted uses this Bot’s Loadout (${choices.default}). ${ASSIGNMENT_LOADOUT_GUIDANCE} Allowed Loadouts:\n${loadouts}`,
  };
}
