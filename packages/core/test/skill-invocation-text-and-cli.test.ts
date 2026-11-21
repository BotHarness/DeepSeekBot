import { describe, expect, it } from 'vitest';
import { skillInvocationTokens } from '../src/bots/cli-skills.js';
import { markSkillTokens, skillInvocationPrompt } from '../src/runtime/bot-runtime.js';

describe('Skill Invocation text', () => {
  it('marks only picked tokens and escapes the path attribute', () => {
    const invocations = [
      {
        name: 'pdf',
        owner: { kind: 'host' } as const,
        start: 0,
        end: 4,
        path: '/a"b/SKILL.md',
        content: 'Do PDF things.',
      },
    ];
    expect(markSkillTokens('/pdf and /pdf-two and x/pdf', invocations)).toBe(
      '[/pdf] and /pdf-two and x/pdf',
    );
    expect(markSkillTokens('/pdf, next', invocations)).toBe('[/pdf], next');
    expect(markSkillTokens('/pdf and /pdf', invocations)).toBe('[/pdf] and /pdf');
    expect(markSkillTokens('/pdf and /pdf', [{ ...invocations[0]!, start: 9, end: 13 }])).toBe(
      '/pdf and [/pdf]',
    );
    expect(
      markSkillTokens('/pdf /pdf', [{ ...invocations[0]!, start: 5, end: 9 }, invocations[0]!]),
    ).toBe('[/pdf] [/pdf]');
    expect(skillInvocationPrompt(invocations)).toContain(
      '<skill_invocation name="pdf" owner="host" path="/a&quot;b/SKILL.md">\nDo PDF things.\n</skill_invocation>',
    );
    expect(skillInvocationPrompt([])).toBe('');
  });
});

describe('deepseekbot send --skill', () => {
  it('assigns repeated names to unused occurrences in flag order', () => {
    expect(skillInvocationTokens('/pdf /pdf', ['host/pdf', 'bot:ada/pdf'])).toEqual([
      { name: 'pdf', owner: { kind: 'host' }, start: 0, end: 4 },
      { name: 'pdf', owner: { kind: 'bot', botSlug: 'ada' }, start: 5, end: 9 },
    ]);
    expect(skillInvocationTokens('x/pdf /pdf-two /pdf /pdf', ['bot:ada/pdf', 'host/pdf'])).toEqual([
      { name: 'pdf', owner: { kind: 'bot', botSlug: 'ada' }, start: 15, end: 19 },
      { name: 'pdf', owner: { kind: 'host' }, start: 20, end: 24 },
    ]);
    expect(() => skillInvocationTokens('/pdf', ['host/pdf', 'bot:ada/pdf'])).toThrow();
    expect(() =>
      skillInvocationTokens('/pdf /pdf', ['host/pdf', 'bot:ada/pdf', 'host/pdf']),
    ).toThrow();
  });

  it('maps owner/name to the first matching /name token', () => {
    expect(skillInvocationTokens('run /pdf then /review', ['bot:ada/review', 'host/pdf'])).toEqual([
      { name: 'pdf', owner: { kind: 'host' }, start: 4, end: 8 },
      { name: 'review', owner: { kind: 'bot', botSlug: 'ada' }, start: 14, end: 21 },
    ]);
    expect(() => skillInvocationTokens('no token', ['host/pdf'])).toThrow(/needs \/pdf/u);
    expect(() => skillInvocationTokens('/pdf', ['pdf'])).toThrow(/<owner>\/<name>/u);
  });
});
