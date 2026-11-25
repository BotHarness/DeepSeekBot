import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CLI_EFFECTS, cliEffects } from '../src/bots/cli-effects.js';
import { humanContext } from '../src/humans/context.js';
import { authorizeTobHostCli } from '../src/tob/cli-host-commands.js';

const holders = ['manager-a', 'manager-b', 'manager-c'];
const deps = {
  registry: { getHistorical: () => undefined },
  channels: { get: () => undefined },
  human: humanContext('owner'),
  hasManagementGrant: (slug: string) => holders.includes(slug),
};
const known = Object.keys(CLI_EFFECTS);
const word = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,15}$/u)
  .filter((value) => !holders.includes(value));
const target = fc.constantFrom(
  ...holders.flatMap((slug) => [slug, `--bot=${slug}`, `--slug=${slug}`]),
);

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

describe('Management holders cannot change another holder’s authority (docs/decisions/tob.md#tob-self-escalation)', () => {
  it('refuses any management or unclassified command that names any management grant holder', () => {
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
        },
      ),
      { numRuns: 3000 },
    );
  });

  it('permits a targeted access change for a Bot without either grant', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('browser-access-set', 'computer-access-set', 'access-set'),
        word,
        (command, slug) => {
          expect(outcome([command, slug])).not.toBe('self-escalation-refused');
        },
      ),
      { numRuns: 2000 },
    );
  });
});
