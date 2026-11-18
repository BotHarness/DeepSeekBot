import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { BROKER_CLI_READS, CLI_EFFECTS, cliEffects } from '../src/bots/cli-effects.js';
import { canonicalCliCommandName } from '../src/bots/cli-command-names.js';
import { classifyTobHostCli } from '../src/tob/cli-host-commands.js';

const known = Object.keys(CLI_EFFECTS);
const reads = [...BROKER_CLI_READS];
const word = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/u);
const command = fc.oneof(fc.constantFrom(...known), fc.constantFrom(...reads), word);
const argument = fc.oneof(
  word,
  fc.constantFrom(
    '--compact',
    '--json',
    '--bot',
    '--limit',
    '10',
    'tob',
    '/tmp/a',
    '--out',
    '--out=/tmp/a',
  ),
);
const argv = fc
  .tuple(command, fc.array(argument, { maxLength: 6 }))
  .map(([name, rest]): [string, ...string[]] => [name, ...rest]);
const refusedOption = fc.constantFrom(
  '--host',
  '--token-file',
  '--home',
  '--as',
  '--administration',
);

function classify(args: readonly string[]): { write: boolean } | 'refused' | 'invalid' {
  try {
    return classifyTobHostCli(args);
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error)) throw error;
    if (error.code === 'cli-command-refused') return 'refused';
    if (error.code === 'invalid-request') return 'invalid';
    throw error;
  }
}

describe('Tob runs the Human CLI with approved writes (docs/decisions/tob.md)', () => {
  it('runs a command at once only when the read list names it, it changes nothing, and it writes no file', () => {
    fc.assert(
      fc.property(argv, (args) => {
        const result = classify(args);
        if (typeof result === 'string' || result.write) return;
        expect(BROKER_CLI_READS.has(canonicalCliCommandName(args[0]))).toBe(true);
        expect(cliEffects(args)?.changes).toBe('none');
        expect(args.some((arg) => arg === '--out' || arg.startsWith('--out='))).toBe(false);
      }),
      { numRuns: 3000 },
    );
  });

  it('treats a command the Host does not know as a write', () => {
    fc.assert(
      fc.property(
        word.filter((name) => !BROKER_CLI_READS.has(canonicalCliCommandName(name))),
        fc.array(argument, { maxLength: 4 }),
        (name, rest) => {
          const result = classify([name, ...rest]);
          if (typeof result === 'string') return;
          expect(result.write).toBe(true);
        },
      ),
    );
  });

  it('turns any read into a write when it names an output file', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...reads),
        fc.array(argument, { maxLength: 4 }),
        fc.nat(),
        fc.constantFrom(['--out', '/tmp/a'], ['--out=/tmp/a']),
        (name, rest, at, out) => {
          const tail = [...rest];
          tail.splice(at % (tail.length + 1), 0, ...out);
          const result = classify([name, ...tail]);
          if (typeof result === 'string') return;
          expect(result.write).toBe(true);
        },
      ),
    );
  });

  it('refuses a chosen Host, Human credentials or offline Profile wherever the option appears', () => {
    fc.assert(
      fc.property(argv, refusedOption, fc.boolean(), fc.nat(), (args, option, inline, at) => {
        const tail = args.slice(1);
        tail.splice(at % (tail.length + 1), 0, ...(inline ? [option + '=x'] : [option, 'x']));
        expect(classify([args[0], ...tail])).toBe('refused');
      }),
    );
  });
});
