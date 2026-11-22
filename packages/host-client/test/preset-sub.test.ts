import { expect, it, vi } from 'vitest';
import { HostAnswerInvalid } from '../src/host-answer';
import { createModelPreset, setModelPlan, updateModelPreset } from '../src/model-plans';
import {
  addSubChoice,
  cleanSub,
  loadPlanSub,
  loadPresetSub,
  parseSubChoices,
  removeSubChoice,
  savePlanSub,
  savePresetSub,
  setSubDefault,
  setSubEffort,
  setSubNote,
  staleGroupEfforts,
  subSelectionOf,
  type SubChoice,
  type SubChoices,
  type SubSelection,
} from '../src/preset-sub';

const group = { kind: 'group', group: 'fast' } as const;
const engine = { kind: 'engine', engine: 'codex', accountId: 'work', model: 'fast' } as const;
const model = {
  kind: 'model',
  provider: 'local',
  model: 'small',
  allowedEfforts: [''],
  defaultEffort: '',
} satisfies SubChoice;
const sub = {
  choices: [model, group, { ...engine, effort: 'high', note: 'Work' }],
  default: engine,
} satisfies SubChoices;

it('extracts only the selection fields for each choice kind', () => {
  expect(subSelectionOf({ ...model, note: 'Draft' })).toEqual({
    kind: 'model',
    provider: 'local',
    model: 'small',
  });
  expect(subSelectionOf({ ...group, note: 'Draft' })).toEqual(group);
  expect(subSelectionOf({ ...engine, note: 'Draft', effort: 'high' })).toEqual(engine);
  expect(subSelectionOf({ kind: 'engine', engine: 'claude', effort: 'high' })).toEqual({
    kind: 'engine',
    engine: 'claude',
  });
});

it('adds a first default and distinguishes engine accounts while deduplicating selections', () => {
  const added = addSubChoice({ choices: [], default: null }, { ...group, note: 'Draft' });
  expect(added).toEqual({ choices: [{ ...group, note: 'Draft' }], default: group });
  expect(addSubChoice(added, group)).toBe(added);
  expect(addSubChoice(sub, { ...engine, effort: 'low' })).toBe(sub);
  const otherAccount = { ...engine, accountId: 'personal' };
  expect(addSubChoice(sub, otherAccount)).toEqual({
    choices: [...sub.choices, otherAccount],
    default: engine,
  });
});

it('promotes the first remaining choice only when removing the default', () => {
  expect(removeSubChoice(sub, group)).toEqual({
    choices: [model, sub.choices[2]],
    default: engine,
  });
  expect(removeSubChoice(sub, engine)).toEqual({
    choices: [model, group],
    default: subSelectionOf(model),
  });
  expect(removeSubChoice(sub, { ...engine, accountId: 'other' })).toBe(sub);
  expect(removeSubChoice({ choices: [group], default: group }, group)).toEqual({
    choices: [],
    default: null,
  });
});

it('sets the default to a listed selection', () => {
  expect(setSubDefault(sub, group)).toEqual({ choices: sub.choices, default: group });
  expect(setSubDefault(sub, { ...group, group: 'missing' })).toBe(sub);
});

it('changes a model effort and adds it to the allowed list only once', () => {
  const selection = subSelectionOf(model);
  const changed = setSubEffort(sub, selection, 'high', []);
  expect(changed.choices).toEqual([
    { ...model, allowedEfforts: ['', 'high'], defaultEffort: 'high' },
    ...sub.choices.slice(1),
  ]);
  expect(changed.default).toBe(engine);
  expect(setSubEffort(changed, selection, '', []).choices[0]).toEqual({
    ...model,
    allowedEfforts: ['', 'high'],
  });
  expect(model.allowedEfforts).toEqual(['']);
});

it('seeds group efforts from the shared catalog, keeps stored efforts and clears the override', () => {
  const noted = setSubNote(sub, group, '  Draft  ');
  const groupEfforts = ['low', 'high'];
  const configured = setSubEffort(noted, group, 'high', groupEfforts);
  expect(configured.choices[1]).toEqual({
    ...group,
    note: '  Draft  ',
    allowedEfforts: ['low', 'high'],
    defaultEffort: 'high',
  });
  expect(setSubEffort(noted, group, 'medium', groupEfforts).choices[1]).toEqual({
    ...group,
    note: '  Draft  ',
    allowedEfforts: ['low', 'high', 'medium'],
    defaultEffort: 'medium',
  });
  expect(setSubEffort(configured, group, 'max', ['max']).choices[1]).toEqual({
    ...group,
    note: '  Draft  ',
    allowedEfforts: ['low', 'high', 'max'],
    defaultEffort: 'max',
  });
  expect(setSubEffort(configured, group, '', []).choices[1]).toEqual({
    ...group,
    note: '  Draft  ',
  });
});

it('sets or removes the effort on the selected engine model', () => {
  expect(setSubEffort(sub, engine, 'low', []).choices[2]).toEqual({
    ...engine,
    effort: 'low',
    note: 'Work',
  });
  expect(setSubEffort(sub, engine, '', []).choices[2]).toEqual({ ...engine, note: 'Work' });
  expect(setSubEffort(sub, { ...engine, accountId: 'other' }, 'low', [])).toEqual(sub);
});

it('stores notes verbatim and removes only blank notes before saving', () => {
  const selections: SubSelection[] = [subSelectionOf(model), group, engine];
  const drafts = selections.reduce<SubChoices>(
    (current, selection, index) =>
      setSubNote(current, selection, index === 1 ? '  Work  ' : ' \n '),
    sub,
  );
  expect(drafts.choices.map((choice) => choice.note)).toEqual([' \n ', '  Work  ', ' \n ']);
  expect(cleanSub(drafts)).toEqual({
    choices: [model, { ...group, note: '  Work  ' }, { ...engine, effort: 'high' }],
    default: engine,
  });
  expect(sub.choices[2]).toMatchObject({ note: 'Work' });
});

it('detects a stored group effort that the current group no longer shares', () => {
  const configured = { ...group, allowedEfforts: ['low', 'high'], defaultEffort: 'low' };
  expect(staleGroupEfforts(configured, ['low'])).toBe(true);
  expect(staleGroupEfforts(configured, ['low', 'high', 'max'])).toBe(false);
  expect(staleGroupEfforts(group, [])).toBe(false);
  expect(staleGroupEfforts(model, [])).toBe(false);
});

it.each([
  null,
  { choices: [], default: group },
  { choices: sub.choices, default: null },
  { choices: [group, group], default: group },
  { choices: [group], default: { ...group, group: 'absent' } },
  { choices: [{ ...engine, effort: 1 }], default: engine },
  { choices: [{ ...group, allowedEfforts: ['high'], defaultEffort: 'low' }], default: group },
  { choices: [group, { kind: 'model' }], default: group },
])('rejects an invalid nested sub answer %j', (value) => {
  expect(parseSubChoices(value)).toBeUndefined();
});

it('reads and saves both owners with their target, revision and full selection', async () => {
  const preset = { id: 'default', revision: 3, sub, legacyOpen: true };
  const plan = { slug: 'ada', revision: 5, sub };
  const host = {
    call: vi
      .fn()
      .mockResolvedValueOnce(preset)
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(preset)
      .mockResolvedValueOnce(plan),
  };
  await expect(loadPresetSub(host, 'default')).resolves.toEqual(preset);
  await expect(loadPlanSub(host, 'ada')).resolves.toEqual(plan);
  await expect(savePresetSub(host, { id: 'default', expectedRevision: 2, sub })).resolves.toEqual(
    preset,
  );
  await expect(savePlanSub(host, { slug: 'ada', expectedRevision: 4, sub })).resolves.toEqual(plan);
  expect(host.call.mock.calls).toEqual([
    ['modelPresetSub', { id: 'default' }],
    ['modelPlanSub', { slug: 'ada' }],
    ['modelPresetSubSet', { id: 'default', expectedRevision: 2, sub }],
    ['modelPlanSubSet', { slug: 'ada', expectedRevision: 4, sub }],
  ]);
});

it.each([
  { slug: 'wrong', revision: 1, sub },
  { slug: 'ada', revision: 0, sub },
  { slug: 'ada', revision: 1, sub, legacyOpen: false },
  { slug: 'ada', revision: 1, sub: {} },
])('rejects a malformed plan response %j', async (reply) => {
  await expect(loadPlanSub({ call: async () => reply }, 'ada')).rejects.toBeInstanceOf(
    HostAnswerInvalid,
  );
});

it('sends and parses full saves with the main route and sub choices in one call each', async () => {
  const orchestrator = { provider: 'local', model: 'main' };
  const fields = { orchestrator, sub };
  const preset = {
    id: 'preset',
    name: 'Preset',
    revision: 1,
    assignmentDefault: orchestrator,
    ...fields,
  };
  const plan = { revision: 1, ...fields };
  const host = {
    call: vi
      .fn()
      .mockResolvedValueOnce({ preset })
      .mockResolvedValueOnce({ preset: { ...preset, revision: 2, name: 'Edited' } })
      .mockResolvedValueOnce({ plan }),
  };
  await expect(createModelPreset(host, { name: 'Preset', ...fields })).resolves.toMatchObject({
    sub,
  });
  await expect(
    updateModelPreset(host, 'preset', 1, { name: 'Edited', ...fields }),
  ).resolves.toMatchObject({ sub });
  await expect(setModelPlan(host, 'ada', 0, fields)).resolves.toMatchObject({ sub });
  expect(host.call.mock.calls).toEqual([
    ['modelPresetCreate', { name: 'Preset', ...fields }],
    ['modelPresetUpdate', { id: 'preset', expectedRevision: 1, name: 'Edited', ...fields }],
    ['modelPlanSet', { slug: 'ada', expectedRevision: 0, ...fields }],
  ]);
});
