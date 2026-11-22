import {
  isPresetSub,
  matchesPresetSubChoice,
  type PresetSub as SubChoices,
  type PresetSubChoice as SubChoice,
  type PresetSubSelection as SubSelection,
} from '@botharness/host-protocol/preset-sub';
import { HostAnswerInvalid, count, record, type HostCall } from './host-answer';

export type {
  PresetSub as SubChoices,
  PresetSubChoice as SubChoice,
  PresetSubSelection as SubSelection,
} from '@botharness/host-protocol/preset-sub';

export function subSelectionOf(choice: SubChoice): SubSelection {
  switch (choice.kind) {
    case 'model':
      return { kind: 'model', provider: choice.provider, model: choice.model };
    case 'group':
      return { kind: 'group', group: choice.group };
    case 'engine': {
      const { engine, accountId, model } = choice;
      return {
        kind: 'engine',
        engine,
        ...(accountId === undefined ? {} : { accountId }),
        ...(model === undefined ? {} : { model }),
      };
    }
  }
}

export function addSubChoice(sub: SubChoices, choice: SubChoice): SubChoices {
  const selection = subSelectionOf(choice);
  if (sub.choices.some((entry) => matchesPresetSubChoice(entry, selection))) return sub;
  return { choices: [...sub.choices, choice], default: sub.default ?? selection };
}

export function removeSubChoice(sub: SubChoices, selection: SubSelection): SubChoices {
  const choices = sub.choices.filter((choice) => !matchesPresetSubChoice(choice, selection));
  if (choices.length === sub.choices.length) return sub;
  const first = choices[0];
  const removedDefault = sub.default !== null && matchesPresetSubChoice(sub.default, selection);
  return {
    choices,
    default: removedDefault ? (first === undefined ? null : subSelectionOf(first)) : sub.default,
  };
}

export function setSubDefault(sub: SubChoices, selection: SubSelection): SubChoices {
  const choice = sub.choices.find((entry) => matchesPresetSubChoice(entry, selection));
  return choice === undefined ? sub : { ...sub, default: subSelectionOf(choice) };
}

function withAllowedEffort(allowed: string[], effort: string): string[] {
  return allowed.includes(effort) ? allowed : [...allowed, effort];
}

export function setSubEffort(
  sub: SubChoices,
  selection: SubSelection,
  effort: string,
  groupEfforts: string[],
): SubChoices {
  return {
    ...sub,
    choices: sub.choices.map((choice): SubChoice => {
      if (!matchesPresetSubChoice(choice, selection)) return choice;
      switch (choice.kind) {
        case 'model':
          return {
            ...choice,
            allowedEfforts: withAllowedEffort(choice.allowedEfforts, effort),
            defaultEffort: effort,
          };
        case 'group': {
          const { allowedEfforts, defaultEffort: _defaultEffort, ...rest } = choice;
          if (effort === '') return rest;
          return {
            ...rest,
            allowedEfforts: withAllowedEffort(allowedEfforts ?? groupEfforts, effort),
            defaultEffort: effort,
          };
        }
        case 'engine': {
          const { effort: _effort, ...rest } = choice;
          return effort === '' ? rest : { ...rest, effort };
        }
      }
    }),
  };
}

export function setSubNote(sub: SubChoices, selection: SubSelection, note: string): SubChoices {
  return {
    ...sub,
    choices: sub.choices.map((choice) =>
      matchesPresetSubChoice(choice, selection) ? { ...choice, note } : choice,
    ),
  };
}

export function cleanSub(sub: SubChoices): SubChoices {
  return {
    ...sub,
    choices: sub.choices.map((choice): SubChoice => {
      if (choice.note === undefined || choice.note.trim() !== '') return choice;
      const { note: _note, ...rest } = choice;
      return rest;
    }),
  };
}

export function staleGroupEfforts(choice: SubChoice, groupEfforts: readonly string[]): boolean {
  return (
    choice.kind === 'group' &&
    (choice.allowedEfforts?.some((effort) => !groupEfforts.includes(effort)) === true ||
      (choice.defaultEffort !== undefined && !groupEfforts.includes(choice.defaultEffort)))
  );
}

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
