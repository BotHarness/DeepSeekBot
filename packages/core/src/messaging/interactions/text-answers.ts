import { withMentionNames } from '../mention-text.js';
import type { MessagingInboundEvent } from '../provider.js';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types';

export type QuestionReply =
  | { kind: 'answer'; answer: AskUserQuestionAnswer; structured: boolean }
  | { kind: 'invalid'; reason: QuestionReplyInvalid; question?: number };

export type QuestionReplyInvalid =
  | 'empty'
  | 'too-long'
  | 'out-of-range'
  | 'single-choice'
  | 'question-count';

export const QUESTION_REPLY_MAX_LENGTH = 2000;

const SEPARATORS = /[\s,，、;；/]+/;
const ALL = new Set(['全部', '全选', 'all']);
const NONE = new Set(['都不选', '不选', '无', 'none']);

export const optionLetter = (index: number) =>
  index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

function optionIndex(token: string): number {
  if (/^\d+$/.test(token)) return Number(token) - 1;
  return /^[A-Za-z]$/.test(token) ? token.toUpperCase().charCodeAt(0) - 65 : Number.NaN;
}

type Single =
  | { kind: 'answer'; selected: string[]; custom?: string }
  | { kind: 'invalid'; reason: QuestionReplyInvalid };

function parseOne(question: AskUserQuestionItem, raw: string): Single {
  const text = raw.trim();
  if (!text) return { kind: 'invalid', reason: 'empty' };
  if (text.length > QUESTION_REPLY_MAX_LENGTH) return { kind: 'invalid', reason: 'too-long' };
  const options = question.options ?? [];
  if (options.length === 0) return { kind: 'answer', selected: [], custom: text };
  const labels = options.map((option) => option.label);
  const lower = text.toLowerCase();
  const label = labels.findIndex((value) => value.trim().toLowerCase() === lower);
  if (label >= 0) return { kind: 'answer', selected: [labels[label]!] };
  if (question.multiSelect) {
    if (ALL.has(lower)) return { kind: 'answer', selected: labels };
    if (NONE.has(lower)) return { kind: 'answer', selected: [] };
  }
  const tokens = text.split(SEPARATORS).filter(Boolean);
  const letters =
    tokens.length === 1 && /^[A-Za-z]{2,}$/.test(text) && question.multiSelect
      ? [...text]
      : undefined;
  const picks = letters ?? tokens;
  if (!picks.every((token) => /^(?:[A-Za-z]|\d{1,3})$/.test(token))) {
    return { kind: 'answer', selected: [], custom: text };
  }
  const indexes = [...new Set(picks.map(optionIndex))];
  if (indexes.some((index) => !(index >= 0 && index < options.length))) {
    if (letters) return { kind: 'answer', selected: [], custom: text };
    return { kind: 'invalid', reason: 'out-of-range' };
  }
  if (!question.multiSelect && indexes.length > 1)
    return { kind: 'invalid', reason: 'single-choice' };
  return {
    kind: 'answer',
    selected: indexes.sort((a, b) => a - b).map((index) => labels[index]!),
  };
}

const marker = (number: number) =>
  new RegExp(`(?:^|\\s)${number}(?![0-9])[ \\t]*[.、:：)）]?[ \\t]*`, 'g');
const MAX_SPLITS = 256;

function numberedSplits(text: string, count: number): string[][] {
  const first = /^1(?![0-9])[ \t]*[.、:：)）]?[ \t]*/.exec(text);
  if (!first) return [];
  const markers = Array.from({ length: count - 1 }, (_, index) =>
    [...text.matchAll(marker(index + 2))].map((found) => ({
      start: found.index,
      end: found.index + found[0].length,
    })),
  );
  const splits: string[][] = [];
  const walk = (level: number, from: number, segments: string[]) => {
    if (splits.length >= MAX_SPLITS) return;
    if (level === markers.length) {
      splits.push([...segments, text.slice(from)]);
      return;
    }
    for (const found of markers[level]!)
      if (found.start > from)
        walk(level + 1, found.end, [...segments, text.slice(from, found.start)]);
  };
  walk(0, first[0].length, []);
  return splits.filter((segments) => segments.every((segment) => segment.trim()));
}

function splitsOf(text: string, count: number): string[][] {
  if (count === 1) return [[text]];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return [...numberedSplits(text, count), ...(lines.length === count ? [lines] : [])];
}

function readSplit(
  questions: readonly AskUserQuestionItem[],
  segments: readonly string[],
): QuestionReply & { score?: number } {
  const answers: AskUserQuestionAnswer['answers'] = [];
  let score = 0;
  for (const [index, question] of questions.entries()) {
    const parsed = parseOne(question, segments[index]!);
    if (parsed.kind === 'invalid')
      return {
        kind: 'invalid',
        reason: parsed.reason,
        ...(questions.length > 1 ? { question: index + 1 } : {}),
      };
    if (parsed.custom === undefined) score += 1;
    answers.push({
      id: question.id,
      selected: parsed.selected,
      ...(parsed.custom === undefined ? {} : { custom: parsed.custom }),
    });
  }
  return { kind: 'answer', answer: { answers }, structured: score === questions.length, score };
}

export function parseQuestionReply(
  questions: readonly AskUserQuestionItem[],
  text: string,
): QuestionReply {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'invalid', reason: 'empty' };
  if (trimmed.length > QUESTION_REPLY_MAX_LENGTH * Math.max(1, questions.length))
    return { kind: 'invalid', reason: 'too-long' };
  const readings = splitsOf(trimmed, questions.length).map((split) => readSplit(questions, split));
  let best: (QuestionReply & { score?: number }) | undefined;
  for (const reading of readings)
    if (reading.kind === 'answer' && (best?.kind !== 'answer' || reading.score! > best.score!))
      best = reading;
  const chosen = best ?? readings[0];
  if (!chosen) return { kind: 'invalid', reason: 'question-count' };
  if (chosen.kind === 'invalid') return chosen;
  return { kind: 'answer', answer: chosen.answer, structured: chosen.structured };
}

function hint(questions: readonly AskUserQuestionItem[]): string {
  if (questions.length > 1)
    return 'Answer each question on its own line, or as 1A 2AC 3 your text. / 每行回答一题，或写成 1A 2AC 3 文字。';
  const question = questions[0];
  if (!question?.options?.length) return 'Reply with your answer. / 直接回复你的答案。';
  return question.multiSelect
    ? 'Reply with letters such as A C, 全部 for all, 都不选 for none, or your own answer. / 回复字母（如 A C）、全部、都不选，或直接写答案。'
    : 'Reply with one letter, or your own answer. / 回复一个字母，或直接写答案。';
}

export function renderQuestionText(
  questions: readonly AskUserQuestionItem[],
  reference: string,
): string {
  const blocks = questions.map((question, index) => {
    const title = `${questions.length > 1 ? `${index + 1}. ` : ''}${
      question.header ? `[${question.header}] ` : ''
    }${question.question}${question.multiSelect && question.options?.length ? ' (多选 / multiple)' : ''}`;
    const lines = [title];
    if (question.detail) lines.push(question.detail);
    for (const [option, value] of (question.options ?? []).entries())
      lines.push(
        `  ${optionLetter(option)}. ${value.label}${value.description ? ` — ${value.description}` : ''}`,
      );
    return lines.join('\n');
  });
  return [...blocks, `${hint(questions)}\n#${reference}`].join('\n\n');
}

export function explainQuestionReply(
  reply: Extract<QuestionReply, { kind: 'invalid' }>,
  questions: readonly AskUserQuestionItem[],
): string {
  const at = reply.question ? `Question ${reply.question}: ` : '';
  const atZh = reply.question ? `第 ${reply.question} 题：` : '';
  switch (reply.reason) {
    case 'empty':
      return `${at}the answer is empty. / ${atZh}答案为空。`;
    case 'too-long':
      return `${at}the answer is longer than ${QUESTION_REPLY_MAX_LENGTH} characters. / ${atZh}答案超过 ${QUESTION_REPLY_MAX_LENGTH} 字。`;
    case 'out-of-range':
      return `${at}that option does not exist. / ${atZh}没有这个选项。`;
    case 'single-choice':
      return `${at}choose only one option. / ${atZh}这是单选题，只能选一个。`;
    case 'question-count':
      return `Answer all ${questions.length} questions. / 请回答全部 ${questions.length} 题。`;
  }
}

export function answerText(event: MessagingInboundEvent): string {
  const body = event.text.trim();
  const lead = event.mentionedAccount
    ? event.mentions.find((mention) => mention.key.length > 0 && body.startsWith(mention.key))
    : undefined;
  return withMentionNames(lead ? body.slice(lead.key.length) : body, event.mentions).trim();
}
