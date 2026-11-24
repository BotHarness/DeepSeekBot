import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CLI_EFFECTS, cliEffects } from '../src/bots/cli-effects.js';
import { humanContext } from '../src/humans/context.js';
import { authorizeTobHostCli } from '../src/tob/cli-host-commands.js';

const TOB = 'tob-steward';
const deps = {
  registry: { getHistorical: () => undefined },
  channels: { get: () => undefined },
  human: humanContext('owner'),
  isSteward: (slug: string) => slug === TOB,
};
const known = Object.keys(CLI_EFFECTS);
const word = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/u).filter((value) => value !== TOB);
const target = fc.constantFrom(TOB, `--bot=${TOB}`, `--slug=${TOB}`);

function outcome(argv: readonly string[]): 'allowed' | string {
  try {
    authorizeTobHostCli(argv, deps);
    return 'allowed';
  } catch (error) {
    if (typeof error !== 'object' || error === null) throw error;
    if ('commandCode' in error) return String(error.commandCode);
    if ('code' in error) return String(error.code);
    throw error;
  }
}

describe('Tob cannot widen its own authority (docs/decisions/tob.md#tob-self-escalation)', () => {
  it('refuses any management or unclassified command that names Tob, wherever Tob appears', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...known),
        fc.array(word, { maxLength: 4 }),
        target,
        fc.nat(),
        (command, rest, tob, at) => {
          const tail = [...rest];
          tail.splice(at % (tail.length + 1), 0, tob);
          const argv = [command, ...tail];
          const effects = cliEffects(argv);
          if (effects === undefined || effects.authority === 'management')
            expect(['self-escalation-refused', 'invalid-request']).toContain(outcome(argv));
          else expect(outcome(argv)).not.toBe('self-escalation-refused');
        },
      ),
      { numRuns: 3000 },
    );
  });

  it('leaves the same commands for any other Bot to the approval card', () => {
    fc.assert(
      fc.property(fc.constantFrom(...known), fc.array(word, { maxLength: 4 }), (command, rest) => {
        expect(outcome([command, ...rest])).not.toBe('self-escalation-refused');
      }),
      { numRuns: 2000 },
    );
  });
});
