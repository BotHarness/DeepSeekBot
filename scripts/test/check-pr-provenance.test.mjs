import { describe, expect, it } from 'vitest';
import { declared, isInternal, plan, trailers } from '../check-pr-provenance.mjs';

const agentBody = 'Closes #1\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';
const existing = [
  'harness:claude-code',
  'harness:opencode',
  'model:claude-opus-5-5',
  'model:glm-5.3',
];

describe('PR and issue provenance', () => {
  it('reads several harnesses and models from the description', () => {
    expect(declared('Harness: Claude Code, opencode\nModel：GLM-5.3、claude-opus-5-5')).toEqual({
      harness: ['claude-code', 'opencode'],
      model: ['glm-5.3', 'claude-opus-5-5'],
    });
  });

  it('ignores an untouched template placeholder', () => {
    expect(declared('Harness: <e.g. claude-code>\nModel: ')).toEqual({ harness: [], model: [] });
    expect(declared('Harness:\nModel: glm-5.3')).toEqual({ harness: [], model: ['glm-5.3'] });
  });

  it('passes work without an agent marker or declaration', () => {
    expect(plan({ body: 'Closes #1', labels: [], existing, external: false })).toEqual({
      add: [],
      errors: [],
      warnings: [],
    });
  });

  it('fails an internal agent PR that declares nothing and has no labels', () => {
    const { errors } = plan({
      body: agentBody,
      labels: ['agent:active'],
      existing,
      external: false,
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('Harness: claude-code');
  });

  it('only warns on an external contribution', () => {
    const result = plan({ body: agentBody, labels: [], existing, external: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(2);
  });

  it('applies declared labels that exist and reports the ones that do not', () => {
    const body = 'Harness: opencode\nModel: glm-5.3, new-model-9';
    expect(plan({ body, labels: [], existing, external: true })).toEqual({
      add: ['harness:opencode', 'model:glm-5.3'],
      errors: [],
      warnings: [expect.stringContaining('`model:new-model-9` is not a label yet')],
    });
  });

  it('accepts labels a maintainer already applied', () => {
    expect(
      plan({
        body: `Agent-Task: codex/local/1\n${agentBody}`,
        labels: ['harness:codex', 'model:gpt-6-luna'],
        existing,
        external: false,
      }).errors,
    ).toEqual([]);
  });

  it('reads the harness and model from Claude Code commit trailers', () => {
    const commit =
      'feat: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' +
      'Claude-Session: https://claude.ai/code/session_1';
    expect(
      trailers([commit, 'Merge main\n\nCo-authored-by: Claude <noreply@anthropic.com>']),
    ).toEqual({ harness: ['claude-code'], model: ['claude-opus-5-5'] });
    expect(
      plan({
        body: `Harness: claude-code\nModel:\n${agentBody}`,
        labels: [],
        existing,
        external: false,
        commits: [commit],
      }),
    ).toEqual({ add: ['harness:claude-code', 'model:claude-opus-5-5'], errors: [], warnings: [] });
  });

  it('prefers what the description declares over commit trailers', () => {
    const commit = 'x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
    expect(
      plan({
        body: 'Harness: opencode\nModel: glm-5.3',
        labels: [],
        existing,
        external: false,
        commits: [commit],
      }).add,
    ).toEqual(['harness:opencode', 'model:glm-5.3']);
  });

  it('treats a private org member with write access as internal', () => {
    expect(isInternal('MEMBER', 'none')).toBe(true);
    expect(isInternal('CONTRIBUTOR', 'write')).toBe(true);
    expect(isInternal('NONE', 'admin')).toBe(true);
    expect(isInternal('CONTRIBUTOR', 'read')).toBe(false);
    expect(isInternal('FIRST_TIME_CONTRIBUTOR', 'none')).toBe(false);
  });
});
