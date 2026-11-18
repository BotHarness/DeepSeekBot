import { describe, expect, it } from 'vitest';

import {
  modelCatalogGroupEfforts,
  modelCatalogGroupFront,
  parseModelCatalog,
} from '../src/model-catalog.js';

const flash = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const pro = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
const until = '2026-11-22T23:23:00.000Z';

describe('parseModelCatalog reads Routing Groups and rest state (#4421)', () => {
  it('keeps well-formed groups and resting models, and drops the rest', () => {
    const answer = parseModelCatalog({
      models: [
        { ...flash, restingUntil: until },
        { ...pro, restingUntil: '' },
      ],
      groups: [
        { id: 'daily', name: 'Daily', revision: 3, mode: 'order', routes: [flash, pro, {}] },
        { id: 'unnamed', routes: [pro], restingUntil: until },
        { id: 'empty', name: 'Empty', routes: [] },
        { name: 'No id', routes: [pro] },
        'junk',
      ],
    });
    expect(answer.models[0]).toMatchObject({ restingUntil: until });
    expect(answer.models[1]).not.toHaveProperty('restingUntil');
    expect(answer.groups).toEqual([
      { id: 'daily', name: 'Daily', revision: 3, routes: [flash, pro] },
      { id: 'unnamed', name: 'unnamed', revision: 0, routes: [pro], restingUntil: until },
    ]);
  });

  it('leaves groups out for a Host that does not send them', () => {
    expect(parseModelCatalog({ models: [] })).not.toHaveProperty('groups');
  });

  it('puts the first member that is not resting or missing a key in front', () => {
    const group = { id: 'daily', name: 'Daily', revision: 1, routes: [flash, pro] };
    const entry = (route: typeof flash, extra = {}) => ({
      ...route,
      providerName: route.provider,
      modelName: route.model,
      ...extra,
    });
    expect(modelCatalogGroupFront(group, [entry(flash), entry(pro)])).toEqual(flash);
    expect(
      modelCatalogGroupFront(group, [entry(flash, { restingUntil: until }), entry(pro)]),
    ).toEqual(pro);
    expect(
      modelCatalogGroupFront(group, [
        entry(flash, { restingUntil: until }),
        entry(pro, { credential: 'missing' }),
      ]),
    ).toEqual(flash);
  });
});

describe('modelCatalogGroupEfforts offers the efforts every reasoning member shares (#4497)', () => {
  const glm = { provider: 'opencode-go', model: 'glm-5' };
  const entry = (route: typeof flash, efforts: string[]) => ({
    ...route,
    providerName: route.provider,
    modelName: route.model,
    efforts: efforts.map((id) => ({ id, name: id.toUpperCase() })),
  });
  const models = [
    entry(flash, ['', 'low', 'high', 'max']),
    entry(pro, ['high', 'max']),
    entry(glm, []),
  ];

  it('intersects reasoning members and ignores members without efforts', () => {
    const group = { routes: [flash, glm, pro, { provider: 'x', model: 'unknown' }] };
    expect(modelCatalogGroupEfforts(group, models)).toEqual([
      { id: 'high', name: 'HIGH' },
      { id: 'max', name: 'MAX' },
    ]);
  });

  it('offers nothing when no member supports reasoning', () => {
    expect(modelCatalogGroupEfforts({ routes: [glm] }, models)).toEqual([]);
  });
});
