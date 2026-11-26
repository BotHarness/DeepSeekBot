import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types';
import {
  explainQuestionReply,
  optionLetter,
  parseQuestionReply,
  renderQuestionText,
} from '../src/messaging/interactions/text-answers.js';

const single: AskUserQuestionItem = {
  id: 'branch',
  question: 'Which branch?',
  options: [{ label: 'main', description: 'Current' }, { label: 'qa' }, { label: 'release' }],
};
const multi: AskUserQuestionItem = {
  id: 'targets',
  question: 'Which targets?',
  multiSelect: true,
  options: [{ label: 'web' }, { label: 'ios' }, { label: 'android' }],
};
const open: AskUserQuestionItem = { id: 'note', question: 'Anything else?' };
const answer = (id: string, selected: string[], custom?: string) => ({
  id,
  selected,
  ...(custom === undefined ? {} : { custom }),
});

describe('one question', () => {
  it.each([
    ['A', ['main']],
    [' b ', ['qa']],
    ['3', ['release']],
    ['Release', ['release']],
  ])('single choice %j', (text, selected) => {
    expect(parseQuestionReply([single], text)).toEqual({
      kind: 'answer',
      answer: { answers: [answer('branch', selected)] },
      structured: true,
    });
  });

  it('single choice refuses several options and options that do not exist', () => {
    expect(parseQuestionReply([single], 'A C')).toEqual({
      kind: 'invalid',
      reason: 'single-choice',
    });
    expect(parseQuestionReply([single], 'D')).toEqual({ kind: 'invalid', reason: 'out-of-range' });
    expect(parseQuestionReply([single], '9')).toEqual({ kind: 'invalid', reason: 'out-of-range' });
  });

  it('other words become a custom answer', () => {
    for (const text of ['ok', 'use the hotfix branch', 'B and C'])
      expect(parseQuestionReply([single], text)).toEqual({
        kind: 'answer',
        answer: { answers: [answer('branch', [], text)] },
        structured: false,
      });
  });

  it.each([
    ['A C', ['web', 'android']],
    ['a,c', ['web', 'android']],
    ['C、A', ['web', 'android']],
    ['ac', ['web', 'android']],
    ['1 2', ['web', 'ios']],
    ['全部', ['web', 'ios', 'android']],
    ['ALL', ['web', 'ios', 'android']],
    ['都不选', []],
    ['none', []],
    ['ios', ['ios']],
  ])('multiple choice %j', (text, selected) => {
    expect(parseQuestionReply([multi], text)).toMatchObject({
      kind: 'answer',
      answer: { answers: [answer('targets', selected)] },
      structured: true,
    });
  });

  it('compact letters that are not all options read as a word, spaced letters must exist', () => {
    expect(parseQuestionReply([multi], 'ok')).toMatchObject({
      answer: { answers: [answer('targets', [], 'ok')] },
    });
    expect(parseQuestionReply([multi], 'A D')).toEqual({
      kind: 'invalid',
      reason: 'out-of-range',
    });
  });

  it('a question without options takes the whole text, including a lone letter', () => {
    expect(parseQuestionReply([open], ' A \n second line ')).toEqual({
      kind: 'answer',
      answer: { answers: [answer('note', [], 'A \n second line')] },
      structured: false,
    });
    expect(parseQuestionReply([open], '   ')).toEqual({ kind: 'invalid', reason: 'empty' });
    expect(parseQuestionReply([open], 'x'.repeat(2001))).toEqual({
      kind: 'invalid',
      reason: 'too-long',
    });
  });
});

describe('several questions', () => {
  const all = [single, multi, open];

  it('reads inline numbers, keeping digits inside free text with their answer', () => {
    expect(parseQuestionReply(all, '1A 2AC 3 ship at 3 pm, 2 people')).toEqual({
      kind: 'answer',
      answer: {
        answers: [
          answer('branch', ['main']),
          answer('targets', ['web', 'android']),
          answer('note', [], 'ship at 3 pm, 2 people'),
        ],
      },
      structured: false,
    });
  });

  it('reads numbered or plain lines', () => {
    const expected = [
      answer('branch', ['qa']),
      answer('targets', ['ios']),
      answer('note', [], 'thanks'),
    ];
    for (const text of ['1. B\n2. B\n3. thanks', 'B\nB\nthanks', '1）b\n2: 2\n3、thanks'])
      expect(parseQuestionReply(all, text)).toMatchObject({ answer: { answers: expected } });
  });

  it('names the question that failed and refuses a partial answer', () => {
    expect(parseQuestionReply(all, '1A 2D 3 x')).toEqual({
      kind: 'invalid',
      reason: 'out-of-range',
      question: 2,
    });
    expect(parseQuestionReply(all, '1A 2B')).toEqual({ kind: 'invalid', reason: 'question-count' });
    expect(parseQuestionReply(all, 'just chatting')).toEqual({
      kind: 'invalid',
      reason: 'question-count',
    });
  });

  it('structured replies carry no custom text', () => {
    expect(parseQuestionReply([single, multi], '1C 2 全部')).toMatchObject({
      structured: true,
      answer: {
        answers: [answer('branch', ['release']), answer('targets', ['web', 'ios', 'android'])],
      },
    });
  });
});

describe('rendering', () => {
  it('letters options, numbers questions and names the reference', () => {
    expect(renderQuestionText([single], 'ABCDEF123456')).toBe(
      [
        'Which branch?',
        '  A. main — Current',
        '  B. qa',
        '  C. release',
        '',
        'Reply with one letter, or your own answer. / 回复一个字母，或直接写答案。',
        '#ABCDEF123456',
      ].join('\n'),
    );
    const text = renderQuestionText([single, multi, open], 'ABCDEF123456');
    expect(text).toContain('1. Which branch?');
    expect(text).toContain('2. Which targets? (多选 / multiple)');
    expect(text).toContain('3. Anything else?');
    expect(text).toContain('1A 2AC 3');
  });

  it('explains every refusal in both languages', () => {
    for (const reason of [
      'empty',
      'too-long',
      'out-of-range',
      'single-choice',
      'question-count',
    ] as const)
      expect(
        explainQuestionReply({ kind: 'invalid', reason, question: 2 }, [single, multi]),
      ).toMatch(/[A-Za-z].*\/.*[一-鿿]/);
  });
});

it('every selection written as 1A 2BC… parses back to the same labels', () => {
  const question = fc
    .record({
      count: fc.integer({ min: 1, max: 8 }),
      multiSelect: fc.boolean(),
      picks: fc.uniqueArray(fc.nat({ max: 7 }), { minLength: 1, maxLength: 8 }),
    })
    .map(({ count, multiSelect, picks }) => {
      const valid = picks.filter((pick) => pick < count);
      const chosen = multiSelect ? (valid.length ? valid : [0]) : [valid[0] ?? 0];
      return { count, multiSelect, chosen: [...chosen].sort((a, b) => a - b) };
    });
  fc.assert(
    fc.property(fc.array(question, { minLength: 1, maxLength: 5 }), fc.boolean(), (spec, lines) => {
      const questions: AskUserQuestionItem[] = spec.map((item, index) => ({
        id: `q${index}`,
        question: `Question ${index}`,
        multiSelect: item.multiSelect,
        options: Array.from({ length: item.count }, (_, option) => ({
          label: `label ${index}.${option}`,
        })),
      }));
      const parts = spec.map((item) => item.chosen.map(optionLetter).join(' '));
      const text =
        spec.length === 1
          ? parts[0]!
          : parts.map((part, index) => `${index + 1}${part}`).join(lines ? '\n' : ' ');
      expect(parseQuestionReply(questions, text)).toEqual({
        kind: 'answer',
        structured: true,
        answer: {
          answers: spec.map((item, index) => ({
            id: `q${index}`,
            selected: item.chosen.map((option) => `label ${index}.${option}`),
          })),
        },
      });
    }),
  );
});
