import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { field, problems } from '../check-pr-body.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const template = readFileSync(join(root, '.github', 'pull_request_template.md'), 'utf8');

const filled = `## Why the change

Refs #4296

## Special things to note

- Merge risk: low; revert the PR.
- Verification:
  - Automated: \`pnpm lint\` passed.
  - Not run: Windows.
`;

describe('check-pr-body', () => {
  it('passes a body with a plain issue reference, merge risk and verification', () => {
    expect(problems({ title: 'feat: x', body: filled })).toEqual([]);
  });

  it('reads bold, heading and nested forms of a field', () => {
    expect(field('- **Merge risk.** Low. Revert one line.', 'Merge risk')).toBe(
      'Low. Revert one line.',
    );
    expect(field('### Verification\n\nRan the suite: 12 passed.\n', 'Verification')).toBe(
      'Ran the suite: 12 passed.',
    );
    expect(field(filled, 'Verification')).toBe(
      '- Automated: `pnpm lint` passed. - Not run: Windows.',
    );
  });

  it('fails the untouched template on every rule', () => {
    expect(problems({ title: 'feat: x', body: template })).toEqual([
      'Name the issue: `Closes #N` when this PR delivers it, `Refs #N` when part is still unbuilt.',
      'Replace the template text after `Merge risk:`: say how to revert, what it can break and where review should look.',
      'Replace the template text after `Verification:`: list the checks you ran with their results, and what was not run.',
      'Replace the template text "Explain the user problem in one sentence…" with this PR\'s own.',
      'Replace the template text "Show the smallest useful before/after or structural outline…" with this PR\'s own.',
    ]);
  });

  it('rejects an issue reference that only appears inside a link', () => {
    const body = filled.replace('Refs #4296', '[Refs #4296](https://example.test/4296)');
    expect(problems({ title: 'feat: x', body })).toEqual([
      'Write `Closes #N` or `Refs #N` as plain text; GitHub ignores it inside a Markdown link.',
    ]);
  });

  it('names each missing field', () => {
    expect(problems({ title: 'feat: x', body: 'Closes #1' })).toEqual([
      'Add a `Merge risk:` line under "Special things to note": say how to revert, what it can break and where review should look.',
      'Add a `Verification:` line under "Special things to note": list the checks you ran with their results, and what was not run.',
    ]);
  });

  it('skips bots, release PRs and reverts', () => {
    expect(problems({ title: 'chore(deps): bump', body: '', author: 'renovate[bot]' })).toEqual([]);
    expect(problems({ title: 'chore(release): 0.9.0', body: '' })).toEqual([]);
    expect(problems({ title: 'Revert "feat: x"', body: '' })).toEqual([]);
  });
});
