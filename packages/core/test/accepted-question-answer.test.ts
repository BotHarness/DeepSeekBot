import { describe, expect, it } from 'vitest';
import { acceptedQuestionAnswer } from '../src/channels/accepted-question-answer.js';
import type { ChannelMessage } from '../src/channels/channel.js';

const reference = { messageId: 'request', sessionId: 'session', callId: 'call' };
const answer = { answers: [{ id: 'q', selected: ['Plan A'] }] };
const request: ChannelMessage = {
  id: 'request',
  at: '2026-11-15T00:00:00Z',
  author: { kind: 'bot', slug: 'planner' },
  body: 'Private question',
  userQuestionRequest: {
    sessionId: 'session',
    callId: 'call',
    questions: [{ id: 'q', question: 'Private question' }],
  },
};

describe('accepted native question reconciliation boundary', () => {
  it.each([
    { name: 'missing', message: undefined },
    { name: 'purged', message: { ...request, contentPurge: { at: request.at } } },
    {
      name: 'non-request',
      message: { id: request.id, at: request.at, author: request.author, body: request.body },
    },
    { name: 'different message', message: { ...request, id: 'different' } },
    {
      name: 'different session',
      message: {
        ...request,
        userQuestionRequest: { ...request.userQuestionRequest!, sessionId: 'different' },
      },
    },
    {
      name: 'different call',
      message: {
        ...request,
        userQuestionRequest: { ...request.userQuestionRequest!, callId: 'different' },
      },
    },
    { name: 'non-Bot author', message: { ...request, author: { kind: 'human' as const } } },
  ])('does not synthesize a resolution for a $name canonical request', ({ message }) => {
    expect(acceptedQuestionAnswer(message, reference, answer)).toBeUndefined();
  });

  it('keeps only the original Human identity on a resolution and leaves unknown actors unknown', () => {
    const human = { humanId: 'bob', displayName: 'Bob', defaultDisplayName: null };
    const resolution = acceptedQuestionAnswer(request, reference, answer, human)!;
    expect(resolution.author).toEqual({ kind: 'human', humanId: 'bob', displayName: 'Bob' });
    expect(resolution.userQuestionResolution?.decidedBy).toEqual({
      humanId: 'bob',
      displayName: 'Bob',
    });
    expect(resolution.body).toBe('Plan A');
    const unknown = acceptedQuestionAnswer(request, reference, answer)!;
    expect(unknown.author).toEqual({ kind: 'system' });
    expect(unknown.userQuestionResolution?.decidedBy).toBeUndefined();
  });
});
