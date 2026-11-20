import { expect, it } from 'vitest';
import { parseToolEffects } from '../src/workspaces/tool-effects-contract.js';

it('parses effect metadata once and removes unknown or undefined fields', () => {
  expect(
    parseToolEffects({
      changes: 'irreversible',
      reach: 'external',
      personalData: true,
      authority: 'management',
      secrets: false,
      actor: 'not authority',
    }),
  ).toEqual({
    changes: 'irreversible',
    reach: 'external',
    personalData: true,
    authority: 'management',
    secrets: false,
  });
  expect(
    parseToolEffects({
      changes: 'none',
      reach: 'local',
      personalData: false,
      authority: undefined,
      secrets: undefined,
    }),
  ).toEqual({ changes: 'none', reach: 'local', personalData: false });
});
it.each([
  undefined,
  null,
  [],
  {},
  { changes: 'reversible', reach: 'external', personalData: true, authority: 'model' },
  { changes: 'irreversible', reach: 'unknown', personalData: true },
  { changes: 'none', reach: 'local', personalData: 'yes' },
  { changes: 'none', reach: 'local', personalData: true, secrets: 'yes' },
])('omits malformed optional metadata %j without inventing authority', (value) => {
  expect(parseToolEffects(value)).toBeUndefined();
});
