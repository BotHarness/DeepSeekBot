import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hasSecretField, scanSkillUpload } from '../src/skill-scan.js';

const names = fc.constantFrom(
  'API_KEY',
  'api_key',
  'OPENAI_API_KEY',
  'password',
  'DB_PASSWORD',
  'client_secret',
  'access_token',
  'privateKey',
);
const separators = fc.constantFrom('=', ': ', ' = ', '="', ": '");

const randomValue = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z]{4,20}$/u),
    fc.stringMatching(/^[0-9]{2,8}$/u),
    fc.stringMatching(/^[A-Za-z0-9]{2,16}$/u),
  )
  .map(([letters, digits, tail]) => `${letters}${digits}${tail}`);

const version = fc
  .tuple(fc.nat(30), fc.nat(30), fc.nat(30), fc.constantFrom('', '-beta.1', '-rc2', '+build7'))
  .map(([major, minor, patch, suffix]) => `${major}.${minor}.${patch}${suffix}`);

describe('Skill upload secrets (#5570)', () => {
  it('refuses every upload that writes a random value into a secret field', () => {
    fc.assert(
      fc.property(names, separators, randomValue, (name, separator, value) => {
        const line = `${name}${separator}${value}`;
        expect(hasSecretField(line)).toBe(true);
        expect(scanSkillUpload([{ path: 'SKILL.md', text: line }]).refusal).toBe(
          'skill-secret-detected',
        );
      }),
    );
  });

  it('never refuses a package version pinned under a token-named dependency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('js-tokens', 'jsonwebtoken', 'tokenizer', 'secretjs'),
        fc.constantFrom('"', ''),
        fc.constantFrom('', '^', '~', '>='),
        version,
        (name, quote, range, pinned) => {
          const line = `${quote}${name}${quote}: "${range}${pinned}"`;
          expect(hasSecretField(line)).toBe(false);
        },
      ),
    );
  });
});
