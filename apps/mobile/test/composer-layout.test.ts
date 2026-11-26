import { expect, it } from 'vitest';
import { composerSlots } from '../src/ui/chat/composer-layout';

it('reserves room for the model button beside Send, and for Stop while a turn runs', () => {
  const slot = 48;
  expect(composerSlots({ model: true, slot, leading: slot, trailing: 1, stop: false })).toEqual({
    left: slot,
    right: 2 * slot,
  });
  expect(composerSlots({ model: true, slot, leading: slot, trailing: 0, stop: true })).toEqual({
    left: slot,
    right: 2 * slot,
  });
  expect(composerSlots({ model: true, slot, leading: slot, trailing: 1, stop: true })).toEqual({
    left: 2 * slot,
    right: 2 * slot,
  });
});

it('keeps conversation Composers free of a model slot', () => {
  const slot = 48;
  expect(composerSlots({ model: false, slot, leading: slot, trailing: 1, stop: false })).toEqual({
    left: slot,
    right: slot,
  });
  expect(composerSlots({ model: false, slot, leading: slot, trailing: 0, stop: false })).toEqual({
    left: slot,
    right: 0,
  });
});
