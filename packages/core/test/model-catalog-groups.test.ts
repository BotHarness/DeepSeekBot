import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { ModelCatalogEntry } from '../src/models/catalog.js';
import type { RoutingGroup } from '../src/models/routing-groups.js';

const flash = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const pro = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
const entry = (route: typeof flash): ModelCatalogEntry => ({
  ...route,
  providerName: route.provider,
  modelName: route.model,
  efforts: [],
});
const group = (id: string, routes: (typeof flash)[]): RoutingGroup => ({
  id,
  name: id.toUpperCase(),
  revision: 1,
  mode: 'order',
  members: routes.map((route) => ({ kind: 'model', ...route })),
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
});

function methods(
  rests: { provider: string; model: string; until: string }[],
  options: { team?: unknown } = {},
) {
  const groups = [group('daily', [flash, pro]), group('go', [flash])];
  return createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    modelCatalog: {
      list: async () => [entry(flash), entry(pro)],
      validate: async () => undefined,
    },
    routingGroups: {
      list: () => groups,
      routes: (id: string) => {
        const found = groups.find((candidate) => candidate.id === id);
        if (found === undefined) throw new Error('missing');
        return found.members.map(({ provider, model }) => ({ provider, model }));
      },
    },
    routeRests: { list: () => rests },
    ...options,
  } as unknown as Parameters<typeof createBridgeMethods>[1]);
}

describe('modelCatalog lists Routing Groups and rest state (#4421)', () => {
  it('returns groups with their routes and marks resting models and fully resting groups', async () => {
    const until = '2026-11-22T23:23:00.000Z';
    const answer = await methods([{ ...flash, until }]).modelCatalog({});
    expect(answer).toMatchObject({
      ok: true,
      value: {
        models: [
          { ...flash, restingUntil: until },
          { ...pro, modelName: pro.model },
        ],
        groups: [
          { id: 'daily', name: 'DAILY', revision: 1, mode: 'order', routes: [flash, pro] },
          { id: 'go', routes: [flash], restingUntil: until },
        ],
      },
    });
    if (!answer.ok) throw new Error('catalog');
    expect(answer.value.models[1]).not.toHaveProperty('restingUntil');
    expect(answer.value.groups?.[0]).not.toHaveProperty('restingUntil');
  });

  it('shows a member only the groups whose every route the role allows', async () => {
    const team = {
      isOwner: () => false,
      member: () => ({ status: 'active' }),
      roles: {
        modelsAllowed: () => ({ all: false, routes: [`${flash.provider}/${flash.model}`] }),
      },
    };
    const answer = await methods([], { team }).modelCatalog({});
    expect(answer).toMatchObject({ ok: true, value: { models: [flash], groups: [{ id: 'go' }] } });
  });

  it('leaves groups out when the Host has no Routing Group store', async () => {
    const answer = await createBridgeMethods(OWNER_HUMAN_CONTEXT, {
      modelCatalog: { list: async () => [entry(flash)], validate: async () => undefined },
    } as unknown as Parameters<typeof createBridgeMethods>[1]).modelCatalog({});
    expect(answer.ok && answer.value).not.toHaveProperty('groups');
  });
});
