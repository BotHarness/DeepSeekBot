import { expect, it } from 'vitest';
import type { OnboardingSnapshot } from '../../core/src/onboarding/types.js';
import {
  CHECKLIST_ITEMS,
  checklistDone,
  checklistSettled,
  type ChecklistEvidence,
} from '../src/client/onboarding-checklist.js';

const receipt: OnboardingSnapshot = {
  profileId: 'checklist',
  tutorial: 'active',
  completed: true,
  preparation: 'ready',
};
const evidence = (done: readonly string[]): ChecklistEvidence =>
  Object.fromEntries(
    CHECKLIST_ITEMS.map((item) => [item, done.includes(item)]),
  ) as ChecklistEvidence;

it('keeps the launcher visible until every experience is done', () => {
  expect(checklistDone(undefined)).toBe(0);
  expect(checklistSettled(receipt, undefined)).toBe(false);
  expect(checklistSettled(receipt, evidence(['model', 'conversation']))).toBe(false);
  expect(checklistDone(evidence(['model', 'conversation']))).toBe(2);
  expect(checklistSettled(receipt, evidence(CHECKLIST_ITEMS))).toBe(true);
});

it('settles a skipped tutorial without hiding the hover entry', () => {
  expect(checklistSettled({ ...receipt, tutorial: 'skipped' }, undefined)).toBe(true);
  expect(checklistSettled(undefined, evidence(CHECKLIST_ITEMS))).toBe(false);
});
