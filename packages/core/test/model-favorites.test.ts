import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createModelFavoriteStore, modelFavorite } from '../src/models/favorites.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';

const homes: string[] = [];
const owners: OperationalDatabaseOwner[] = [];

afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function store() {
  const home = mkdtempSync(join(tmpdir(), 'bh-model-favorites-'));
  homes.push(home);
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(owner);
  return { owner, favorites: createModelFavoriteStore({ database: owner }) };
}

const flash = { kind: 'model' as const, provider: 'deepseek', model: 'deepseek-v4.1-flash' };
const pro = { kind: 'model' as const, provider: 'deepseek', model: 'deepseek-v4-pro' };
const group = { kind: 'group' as const, id: 'daily' };

it('keeps favorites per Human in the order they were starred, setting the wanted state', () => {
  const { favorites } = store();
  const human = OWNER_HUMAN_CONTEXT.humanId;
  favorites.set(human, flash, true);
  favorites.set(human, group, true);
  expect(favorites.set(human, flash, true)).toEqual([flash, group]);
  expect(favorites.set(human, pro, true)).toEqual([flash, group, pro]);
  expect(favorites.set(human, flash, false)).toEqual([group, pro]);
  expect(favorites.set(human, flash, false)).toEqual([group, pro]);
  expect(favorites.list('someone-else')).toEqual([]);
});

it('reads only well-formed model and group choices', () => {
  expect(modelFavorite({ kind: 'model', provider: ' deepseek ', model: 'x' })).toEqual({
    kind: 'model',
    provider: 'deepseek',
    model: 'x',
  });
  expect(modelFavorite({ kind: 'group', id: 'g' })).toEqual({ kind: 'group', id: 'g' });
  expect(modelFavorite({ kind: 'model', provider: '', model: 'x' })).toBeUndefined();
  expect(modelFavorite({ kind: 'group', id: ' ' })).toBeUndefined();
  expect(modelFavorite({ provider: 'deepseek', model: 'x' })).toBeUndefined();
});

it('returns the caller’s favorites with the catalog and stars through the bridge', async () => {
  const { favorites } = store();
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    modelFavorites: favorites,
    modelCatalog: {
      list: async () => [],
      validate: async () => undefined,
    },
  } as unknown as Parameters<typeof createBridgeMethods>[1]);
  expect(methods.modelFavoriteSet({ choice: flash, favorite: true })).toEqual({
    ok: true,
    value: { favorites: [flash] },
  });
  expect(await methods.modelCatalog({})).toMatchObject({
    ok: true,
    value: { favorites: [flash] },
  });
  expect(methods.modelFavoriteSet({ choice: { kind: 'model' }, favorite: true })).toMatchObject({
    ok: false,
  });
  expect(
    createBridgeMethods(humanContext('local-human'), {} as never).modelFavoriteSet({
      choice: flash,
      favorite: true,
    }),
  ).toMatchObject({ ok: false });
});
