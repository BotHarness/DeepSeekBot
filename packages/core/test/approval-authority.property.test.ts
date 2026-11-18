import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseApprovalReview } from '../src/workspaces/approval-reviewer.js';
import { decideToolApproval, type ToolEffects } from '../src/workspaces/tool-effects.js';

const effects: fc.Arbitrary<ToolEffects | undefined> = fc.option(
  fc.record(
    {
      changes: fc.constantFrom('none', 'reversible', 'irreversible'),
      reach: fc.constantFrom('local', 'workspace', 'memory', 'external'),
      personalData: fc.boolean(),
      secrets: fc.boolean(),
      authority: fc.constant('management'),
    },
    { requiredKeys: ['changes', 'reach', 'personalData'] },
  ) as fc.Arbitrary<ToolEffects>,
  { nil: undefined },
);

const request = fc.record({
  stage: fc.constant('request' as const),
  fullAccess: fc.boolean(),
  eachUse: fc.boolean(),
  explicitApproval: fc.boolean(),
  legacyProtected: fc.boolean(),
  device: fc.boolean(),
  standingRule: fc.constantFrom('none' as const, 'ordinary' as const, 'explicit' as const),
  reviewer: fc.boolean(),
  rememberable: fc.boolean(),
});

describe('approval authority follows docs/decisions/approvals.md', () => {
  it('keeps protected operations away from Full Access, the Reviewer and ordinary rules', () => {
    fc.assert(
      fc.property(effects, request, (effect, context) => {
        const { path } = decideToolApproval(effect, context);
        const protectedOperation =
          context.legacyProtected || context.explicitApproval || effect?.authority === 'management';
        if (protectedOperation) {
          expect(path === 'human' || path === 'standing-rule').toBe(true);
          if (path === 'standing-rule') expect(context.standingRule).toBe('explicit');
        }
        if (context.device && path === 'standing-rule')
          expect(context.standingRule).toBe('explicit');
        if (context.eachUse) expect(['reviewer', 'human']).toContain(path);
      }),
      { numRuns: 2000 },
    );
  });

  it('answers in order: Full Access, a saved rule, the Reviewer, then the Human card', () => {
    fc.assert(
      fc.property(effects, request, (effect, context) => {
        const { path } = decideToolApproval(effect, context);
        const lower = (changes: Partial<typeof context>) =>
          decideToolApproval(effect, { ...context, ...changes }).path;
        if (path === 'full-access') {
          expect(lower({ standingRule: 'explicit', reviewer: true })).toBe('full-access');
        }
        if (path === 'standing-rule') {
          expect(lower({ reviewer: true })).toBe('standing-rule');
          expect(lower({ standingRule: 'none' })).not.toBe('standing-rule');
        }
        if (path === 'reviewer') expect(lower({ reviewer: false })).toBe('human');
        if (path === 'human') {
          const held =
            context.eachUse ||
            context.legacyProtected ||
            context.explicitApproval ||
            effect?.authority === 'management';
          if (!held) expect([context.fullAccess, context.reviewer]).toEqual([false, false]);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('admits by declaration, so an irreversible external effect alone adds no card', () => {
    fc.assert(
      fc.property(
        effects,
        fc.constantFrom('native' as const, 'existing' as const, 'always' as const),
        fc.boolean(),
        fc.constantFrom('none', 'reversible', 'irreversible'),
        fc.constantFrom('local', 'workspace', 'memory', 'external'),
        (effect, admission, legacyProtected, changes, reach) => {
          const context = { stage: 'admission' as const, admission, legacyProtected };
          const moved =
            effect === undefined ? effect : ({ ...effect, changes, reach } as ToolEffects);
          expect(decideToolApproval(moved, context).path).toBe(
            decideToolApproval(effect, context).path,
          );
        },
      ),
    );
  });

  it('reads only allow or ask-human from the Reviewer, so it can never reject a call', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom('allow', 'ask-human', 'reject', 'deny', 'Allow', 'allow-always'),
          fc.string(),
        ),
        fc.string({ minLength: 1 }),
        (outcome, reason) => {
          const parsed = parseApprovalReview(JSON.stringify({ outcome, reason }));
          if (parsed === undefined) return;
          expect(['allow', 'ask-human']).toContain(parsed.outcome);
          expect(parsed.outcome).toBe(outcome);
        },
      ),
    );
  });
});
