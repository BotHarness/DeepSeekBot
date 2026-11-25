import { expect, it } from 'vitest';
import {
  morphTitleSlots,
  promptPlaceholder,
  sessionHeaderTitle,
  titleMorphKey,
} from '../src/ui/chat/session-header-title';

const at = '2026-11-24T00:00:00Z';
const base = {
  resolved: undefined,
  placeholder: 'Plan the launch',
  fresh: true,
  fallback: 'New Session',
};

it('uses the first non-empty prompt line as the placeholder', () => {
  expect(promptPlaceholder('\n  Plan the launch  \nwith dates')).toBe('Plan the launch');
  expect(promptPlaceholder('x'.repeat(120))).toHaveLength(80);
  expect(promptPlaceholder(' \n ')).toBe('');
});

it('keeps a new Session title pending until the Host reports a generated title', () => {
  expect(sessionHeaderTitle({ ...base, transcript: undefined })).toEqual({
    text: 'Plan the launch',
    pending: true,
  });
  const running = { titleFallback: true, running: true, items: [] };
  expect(sessionHeaderTitle({ ...base, resolved: 'Plan the launch', transcript: running })).toEqual(
    { text: 'Plan the launch', pending: true },
  );
  expect(
    sessionHeaderTitle({
      ...base,
      resolved: 'Launch plan',
      transcript: { running: true, items: [] },
    }),
  ).toEqual({ text: 'Launch plan', pending: false });
});

it('stops waiting when the first turn ends without a generated title', () => {
  expect(
    sessionHeaderTitle({
      ...base,
      resolved: 'Plan the launch',
      transcript: {
        titleFallback: true,
        running: false,
        items: [{ kind: 'reply', text: 'Done', at }],
      },
    }),
  ).toEqual({ text: 'Plan the launch', pending: false });
});

it('falls back to New Session for an empty prompt and never pends an existing Session', () => {
  expect(sessionHeaderTitle({ ...base, placeholder: '', transcript: undefined })).toEqual({
    text: 'New Session',
    pending: true,
  });
  expect(
    sessionHeaderTitle({
      ...base,
      fresh: false,
      fallback: 'session-id',
      transcript: { titleFallback: true, running: true, items: [] },
    }),
  ).toEqual({ text: 'Plan the launch', pending: false });
});

it('cross-fades through two stable slots and keeps the object when nothing changed', () => {
  const first = morphTitleSlots(undefined, 'Plan the launch', true);
  expect(first).toEqual({
    entries: [
      { title: 'Plan the launch', pending: true },
      { title: '', pending: false },
    ],
    active: 0,
  });
  expect(morphTitleSlots(first, 'Plan the launch', true)).toBe(first);
  const second = morphTitleSlots(first, 'Launch plan', false);
  expect(second).toEqual({
    entries: [
      { title: 'Plan the launch', pending: true },
      { title: 'Launch plan', pending: false },
    ],
    active: 1,
  });
  expect(morphTitleSlots(second, 'Launch plan, revised', false)).toMatchObject({
    entries: [{ title: 'Launch plan, revised' }, { title: 'Launch plan' }],
    active: 0,
  });
});

it('changes the morph key when the text or its pending state changes', () => {
  const pending = titleMorphKey('Plan the launch', true);
  expect(titleMorphKey('Plan the launch', true)).toBe(pending);
  expect(titleMorphKey('Plan the launch', false)).not.toBe(pending);
  expect(titleMorphKey('Launch plan', false)).not.toBe(titleMorphKey('Plan the launch', false));
});
