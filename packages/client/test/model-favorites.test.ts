import { afterEach, expect, it } from 'vitest';

import {
  applyModelFavoriteChanges,
  modelChoiceKey,
  serialWrites,
  type ModelChoice,
} from '@botharness/host-client/model-catalog';
import {
  modelFavoritesEpoch,
  modelFavoritesSnapshot,
  rememberModelFavorites,
  setModelFavorite,
} from '../src/client/model-favorites.js';

const a: ModelChoice = { kind: 'model', provider: 'p', model: 'a' };
const b: ModelChoice = { kind: 'model', provider: 'p', model: 'b' };
const group: ModelChoice = { kind: 'group', id: 'daily' };
const order = () => modelFavoritesSnapshot().order;

afterEach(() => rememberModelFavorites(undefined));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it('applies pending changes over the confirmed list in order', () => {
  expect(applyModelFavoriteChanges([a], [{ choice: b, favorite: true }])).toEqual([a, b]);
  expect(
    applyModelFavoriteChanges(
      [a, b],
      [
        { choice: a, favorite: false },
        { choice: group, favorite: true },
        { choice: a, favorite: true },
      ],
    ),
  ).toEqual([b, group, a]);
});

it('runs writes one after another, even when one fails', async () => {
  const log: string[] = [];
  const first = deferred<string>();
  const write = serialWrites(async (name: string) => {
    log.push(name);
    if (name === 'one') return first.promise;
    if (name === 'two') throw new Error('refused');
    return name;
  });
  const one = write('one');
  const two = write('two');
  const three = write('three');
  await Promise.resolve();
  expect(log).toEqual(['one']);
  first.reject(new Error('offline'));
  await expect(one).rejects.toThrow('offline');
  await expect(two).rejects.toThrow('refused');
  await expect(three).resolves.toBe('three');
  expect(log).toEqual(['one', 'two', 'three']);
});

it('keeps a confirmed star when a later overlapping star fails', async () => {
  const replies = [deferred<ModelChoice[]>(), deferred<ModelChoice[]>()];
  let calls = 0;
  rememberModelFavorites([], 'host', () => replies[calls++]!.promise);
  const starA = setModelFavorite(a, true);
  const starB = setModelFavorite(b, true).catch((cause: unknown) => cause);
  expect(order()).toEqual([a, b].map(modelChoiceKey));
  await Promise.resolve();
  expect(calls).toBe(1);
  replies[0]!.resolve([a]);
  await starA;
  replies[1]!.reject(new Error('refused'));
  expect(await starB).toBeInstanceOf(Error);
  expect(order()).toEqual([modelChoiceKey(a)]);
});

it('ignores a catalog read that started before a star, and a completion from another Host', async () => {
  const reply = deferred<ModelChoice[]>();
  rememberModelFavorites([], 'host', () => reply.promise);
  const seen = modelFavoritesEpoch();
  const star = setModelFavorite(a, true);
  const during = modelFavoritesEpoch();
  reply.resolve([a]);
  await star;
  rememberModelFavorites([], 'host', async () => [], seen);
  expect(order()).toEqual([modelChoiceKey(a)]);
  rememberModelFavorites([], 'host', async () => [], during);
  expect(order()).toEqual([modelChoiceKey(a)]);
  rememberModelFavorites([a, group], 'host', async () => [], modelFavoritesEpoch());
  expect(order()).toEqual([a, group].map(modelChoiceKey));
  rememberModelFavorites([b], 'host', async () => []);
  expect(order()).toEqual([modelChoiceKey(b)]);

  const late = deferred<ModelChoice[]>();
  rememberModelFavorites([], 'one', () => late.promise);
  const pending = setModelFavorite(a, true);
  rememberModelFavorites([group], 'two', async () => []);
  late.resolve([a]);
  await pending;
  expect(order()).toEqual([modelChoiceKey(group)]);
});
