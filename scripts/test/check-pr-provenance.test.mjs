import { describe, expect, it } from 'vitest';
import { provenanceErrors } from '../check-pr-provenance.mjs';

const agentBody = 'Closes #1\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';

describe('PR provenance labels', () => {
  it('passes a PR without an agent marker', () => {
    expect(provenanceErrors('Closes #1', [])).toEqual([]);
  });

  it('requires a harness and a model label on an agent PR', () => {
    const errors = provenanceErrors(agentBody, ['agent:active']);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('`harness:`');
    expect(errors[1]).toContain('`model:`');
  });

  it('accepts several harness and model labels', () => {
    expect(
      provenanceErrors(`Agent-Task: codex/local/1\n${agentBody}`, [
        'harness:codex',
        'harness:claude-code',
        'model:gpt-6-luna',
        'model:claude-opus-5-5',
      ]),
    ).toEqual([]);
  });

  it('recognizes an agent co-author trailer', () => {
    expect(
      provenanceErrors('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', ['harness:x']),
    ).toHaveLength(1);
  });
});
