import { expect, it } from 'vitest';
import { composerRows, composerSlots } from '../src/ui/chat/composer-layout';

it('keeps a one-line Session draft in a single-line pill', () => {
  expect(composerRows({ session: 'compact', expanded: false, stackedByContent: false })).toEqual({
    sessionRow: false,
    stacked: false,
    sessionCompact: true,
  });
});

it('moves the model chip to its own row once the Session draft wraps or text is large', () => {
  expect(composerRows({ session: 'compact', expanded: true, stackedByContent: true })).toEqual({
    sessionRow: true,
    stacked: true,
    sessionCompact: false,
  });
});

it('keeps the New Session Composer stacked and DM Composers free of a model control', () => {
  expect(composerRows({ session: 'stacked', expanded: false, stackedByContent: false })).toEqual({
    sessionRow: true,
    stacked: true,
    sessionCompact: false,
  });
  expect(composerRows({ session: 'none', expanded: false, stackedByContent: false })).toEqual({
    sessionRow: false,
    stacked: false,
    sessionCompact: false,
  });
});

it('reserves room for the model logo beside Send, and for Stop while a turn runs', () => {
  const slot = 48;
  expect(
    composerSlots({ session: 'compact', slot, leading: slot, trailing: 1, stop: false }),
  ).toEqual({ left: slot, right: 2 * slot, measured: true });
  expect(
    composerSlots({ session: 'compact', slot, leading: slot, trailing: 0, stop: true }),
  ).toEqual({ left: slot, right: 2 * slot, measured: true });
  expect(
    composerSlots({ session: 'compact', slot, leading: slot, trailing: 1, stop: true }),
  ).toEqual({ left: 2 * slot, right: 2 * slot, measured: true });
  expect(composerSlots({ session: 'none', slot, leading: slot, trailing: 1, stop: false })).toEqual(
    {
      left: slot,
      right: slot,
      measured: true,
    },
  );
});
