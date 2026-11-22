import { expect, it, vi } from 'vitest';
import { HostAnswerInvalid } from '../src/host-answer';
import { createModelPreset, setModelPlan, updateModelPreset } from '../src/model-plans';
import {
  loadPlanSub,
  loadPresetSub,
  parseSubChoices,
  savePlanSub,
  savePresetSub,
  type SubChoices,
} from '../src/preset-sub';

const group = { kind: 'group', group: 'fast' } as const;
const engine = { kind: 'engine', engine: 'codex', accountId: 'work', model: 'fast' } as const;
const sub = {
  choices: [
    { kind: 'model', provider: 'local', model: 'small', allowedEfforts: [''], defaultEffort: '' },
    group,
    { ...engine, effort: 'high', note: 'Work' },
  ],
  default: engine,
} satisfies SubChoices;

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
