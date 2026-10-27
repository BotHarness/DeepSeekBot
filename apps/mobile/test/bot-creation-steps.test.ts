import { expect, it } from 'vitest';
import {
  creationStepReady,
  creationSteps,
  defaultEnvironment,
  isCreationFlow,
  sourceFlow,
} from '../src/host/bot-creation-steps';

it.each([
  ['blank', ['environment', 'identity', 'persona']],
  ['git', ['environment', 'git', 'identity', 'persona']],
  ['zip', ['environment', 'zip', 'identity', 'persona']],
  ['marketplace', ['environment', 'identity', 'confirm']],
] as const)('orders the %s steps', (flow, steps) => {
  expect(isCreationFlow(flow)).toBe(true);
  expect(creationSteps(flow)).toEqual(steps);
});

it('derives the flow from the draft source and rejects unknown route flows', () => {
  expect(sourceFlow(undefined)).toBeUndefined();
  expect(sourceFlow({ kind: 'git', gitUrl: '' })).toBe('git');
  expect(sourceFlow({ kind: 'git', gitUrl: '', origin: 'marketplace' })).toBe('marketplace');
  expect(
    sourceFlow({
      kind: 'zip',
      fileId: 'f',
      fileName: 'a.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      uploadKey: 'k',
    }),
  ).toBe('zip');
  expect(isCreationFlow('toString')).toBe(false);
  expect(isCreationFlow(undefined)).toBe(false);
});

it.each([
  ['the only Environment', [{ hostId: 'A', status: 'online' }], '', 'A'],
  ['nothing when the only Environment is offline', [{ hostId: 'A', status: 'offline' }], 'A', ''],
  [
    'the last-used Environment',
    [
      { hostId: 'A', status: 'online' },
      { hostId: 'B', status: 'checking' },
    ],
    'B',
    'B',
  ],
  [
    'nothing when the last-used Environment is offline',
    [
      { hostId: 'A', status: 'online' },
      { hostId: 'B', status: 'offline' },
    ],
    'B',
    '',
  ],
  [
    'nothing when the last-used Environment is gone',
    [
      { hostId: 'A', status: 'online' },
      { hostId: 'B', status: 'online' },
    ],
    'C',
    '',
  ],
  ['nothing without Environments', [], 'A', ''],
] as const)('preselects %s', (_name, choices, last, expected) => {
  expect(defaultEnvironment(choices, last)).toBe(expected);
});

it('allows leaving a step only with what it asks for', () => {
  const draft = { hostId: 'A', displayName: ' ', persona: '', description: '', tags: '' };
  const choices = [
    { hostId: 'A', status: 'online' as const },
    { hostId: 'B', status: 'offline' as const },
  ];
  expect(creationStepReady('environment', draft, choices)).toBe(true);
  expect(creationStepReady('environment', { ...draft, hostId: 'B' }, choices)).toBe(false);
  expect(creationStepReady('environment', { ...draft, hostId: '' }, choices)).toBe(false);
  expect(creationStepReady('identity', draft, choices)).toBe(false);
  expect(creationStepReady('identity', { ...draft, displayName: 'Ada' }, choices)).toBe(true);
  expect(creationStepReady('persona', draft, choices)).toBe(true);
  expect(
    creationStepReady('git', { ...draft, source: { kind: 'git', gitUrl: ' ' } }, choices),
  ).toBe(false);
  expect(creationStepReady('zip', draft, choices)).toBe(false);
});
