import { describe, expect, it } from 'vitest';

import { EXTERNAL_GUIDANCE_CHARS, inboxLine, renderInbox } from '../src/runtime/inbox-render.js';
import { SCENARIOS } from './inbox-eval/scenarios.js';

describe('Bot Inbox rendering budget', () => {
  it('prices External items at their rendered length, so the budget matches the Inbox', () => {
    const units = SCENARIOS.find((scenario) => scenario.id === 'external-ordinary-batch')!.units;
    const header = renderInbox([]).length + 1;
    const estimate =
      header +
      EXTERNAL_GUIDANCE_CHARS +
      units.reduce((sum, unit) => sum + inboxLine(unit).length + 1, 0);
    expect(estimate).toBe(renderInbox([...units]).length + 1);
    for (const unit of units) expect(inboxLine(unit).length).toBeLessThan(1_600);
  });
});
