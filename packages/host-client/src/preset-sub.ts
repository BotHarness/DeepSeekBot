import { isPresetSub, type PresetSub as SubChoices } from '@botharness/host-protocol/preset-sub';
import { HostAnswerInvalid, count, record, type HostCall } from './host-answer';

export type {
  PresetSub as SubChoices,
  PresetSubChoice as SubChoice,
  PresetSubSelection as SubSelection,
} from '@botharness/host-protocol/preset-sub';

interface SubAnswer {
  revision: number;
  sub: SubChoices;
  legacyOpen?: true;
}

export type PresetSubAnswer = SubAnswer & { id: string };
export type PlanSubAnswer = SubAnswer & { slug: string };

export function parseSubChoices(value: unknown): SubChoices | undefined {
  return isPresetSub(value) ? value : undefined;
}

function parseSubAnswer<Key extends 'id' | 'slug'>(
  value: unknown,
  key: Key,
  target: string,
  method: string,
): SubAnswer {
  const row = record(value);
  const sub = parseSubChoices(row?.['sub']);
  const revision = row?.['revision'];
  const legacyOpen = row?.['legacyOpen'];
  if (
    target.trim() === '' ||
    row?.[key] !== target ||
    !count(revision) ||
    revision < 1 ||
    sub === undefined ||
    (legacyOpen !== undefined && legacyOpen !== true)
  )
    throw new HostAnswerInvalid(`${method} returned an invalid answer.`);
  return { revision, sub, ...(legacyOpen === true ? { legacyOpen } : {}) };
}

export async function loadPresetSub(host: HostCall, id: string): Promise<PresetSubAnswer> {
  const result = await host.call('modelPresetSub', { id });
  return { id, ...parseSubAnswer(result, 'id', id, 'modelPresetSub') };
}

export async function savePresetSub(
  host: HostCall,
  input: { id: string; expectedRevision: number; sub: SubChoices },
): Promise<PresetSubAnswer> {
  const result = await host.call('modelPresetSubSet', input);
  return { id: input.id, ...parseSubAnswer(result, 'id', input.id, 'modelPresetSubSet') };
}

export async function loadPlanSub(host: HostCall, slug: string): Promise<PlanSubAnswer> {
  const result = await host.call('modelPlanSub', { slug });
  return { slug, ...parseSubAnswer(result, 'slug', slug, 'modelPlanSub') };
}

export async function savePlanSub(
  host: HostCall,
  input: { slug: string; expectedRevision: number; sub: SubChoices },
): Promise<PlanSubAnswer> {
  const result = await host.call('modelPlanSubSet', input);
  return { slug: input.slug, ...parseSubAnswer(result, 'slug', input.slug, 'modelPlanSubSet') };
}
