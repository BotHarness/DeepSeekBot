import { join } from 'node:path';
import { vi, type Mock } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { OWNER_HUMAN_CONTEXT } from '../../src/humans/context.js';
import { createChannelStore } from '../../src/channels/store.js';
import { ChannelUserQuestions, type TimedQuestionPort } from '../../src/channels/user-questions.js';
import { createBotStateTracker } from '../../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from '../helpers.js';

export const sessionId = 'botharness-orchestrator-question-test';
export const channelId = 'dm-ada';
export const questions = [
  {
    id: 'memory-branch',
    question: 'Which Memory branch should I switch to?',
    options: [
      { label: 'main', description: 'Current branch' },
      { label: 'history-qa', description: 'Earlier memory' },
    ],
  },
];

export function fixture(
  role: 'orchestrator' | 'assignment' = 'orchestrator',
  timed?: TimedQuestionPort,
) {
  const channels = createChannelStore({
    rootDir: join(createTempRoot('bh-question-'), 'channels'),
  });
  channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const ownership = createTestOwnership({ [sessionId]: { botSlug: 'ada', rootRole: role } });
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/memory' } } } as Agent;
  let live = true;
  const warn: Mock<(message: string) => void> = vi.fn();
  const states = createBotStateTracker();
  states.setSessionState('ada', sessionId, 'working', undefined, 'orchestrator');
  const answerer = new ChannelUserQuestions(
    channels,
    ownership,
    (candidate) => candidate === agent && live,
    warn,
    (slug, count) => states.setQuestionCount(slug, count),
    timed,
  );
  return {
    channels,
    ownership,
    agent,
    answerer,
    warn,
    states,
    setLive: (value: boolean) => {
      live = value;
    },
  };
}
