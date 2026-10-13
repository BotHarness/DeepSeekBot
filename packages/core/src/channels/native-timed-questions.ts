import type { Context } from '@deepseek-ai/cordis';
import type { TimedQuestionPort } from './user-questions.js';
import type { BotRuntime } from '../runtime/bot-runtime.js';
import type { DshSessionStore } from '../sessions/source.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function nativeTimedQuestions(
  ctx: Context,
  runtime: BotRuntime,
  sessions: DshSessionStore,
): TimedQuestionPort {
  const views = new Map<string, Record<string, unknown>>();
  const liveRoot = (sessionId: string): unknown => {
    const agents = record(ctx.get('agents'));
    if (typeof agents?.['roots'] !== 'function') return undefined;
    const roots: unknown = agents['roots'].call(agents);
    return Array.isArray(roots)
      ? roots.find((agent: unknown) => record(record(agent)?.['session'])?.['id'] === sessionId)
      : undefined;
  };
  const questionsOf = (sessionId: string): Record<string, unknown> | undefined => {
    const session = record(liveRoot(sessionId))?.['session'] ?? sessions.get(sessionId);
    if (session === undefined) return views.get(sessionId);
    const service = record(ctx.get('sessionProjections'));
    if (typeof service?.['stateOf'] !== 'function') return undefined;
    const fold: unknown = service['stateOf'].call(service, session, 'userQuestions');
    const questions = record(record(fold)?.['questions']);
    if (questions === undefined) views.delete(sessionId);
    else views.set(sessionId, questions);
    return questions;
  };
  return {
    bind: (sessionId, channelId) => runtime.bindNativeQuestionInput?.(sessionId, channelId),
    recover: (sessionId, channelId, requestMessageId) =>
      runtime.recoverNativeQuestionInput?.(sessionId, channelId, requestMessageId),
    available: (sessionId, channelId) =>
      runtime.nativeQuestionAvailable?.(sessionId, channelId) ?? true,
    async load(sessionIds) {
      const query = record(ctx.get('sessionQuery'));
      const projections = record(ctx.get('sessionProjections'));
      if (
        typeof query?.['readSession'] !== 'function' ||
        typeof projections?.['restore'] !== 'function'
      )
        return;
      for (const sessionId of sessionIds) {
        if (liveRoot(sessionId) !== undefined || sessions.get(sessionId) !== undefined) continue;
        try {
          const snapshot = record(await query['readSession'].call(query, sessionId));
          const restored: unknown = projections['restore'].call(
            projections,
            {},
            snapshot?.['events'],
            0,
            snapshot?.['session'],
            snapshot?.['inheritedEventCount'] ?? 0,
          );
          const questions = record(
            record(record(record(restored)?.['snapshot'])?.['values'])?.['userQuestions'],
          );
          if (questions !== undefined) views.set(sessionId, questions);
        } catch {
          ctx.logger.warn(`botharness.channel_question.native_read_failed session=${sessionId}`);
        }
      }
    },
    read(sessionId, callId) {
      const questions = questionsOf(sessionId);
      const active = questions?.['active'];
      if (!Array.isArray(active)) return undefined;
      const pending = record(active.find((item: unknown) => record(item)?.['callId'] === callId));
      const state = pending?.['state'];
      if (state === 'open' || state === 'continued') return { state };
      const settled = questions?.['settled'];
      if (!Array.isArray(settled)) return undefined;
      const answers = record(
        settled.find((item: unknown) => record(item)?.['callId'] === callId),
      )?.['answers'];
      if (!Array.isArray(answers)) return undefined;
      return { state: 'answered', answer: { answers } };
    },
    answer(sessionId, callId, answer) {
      const service = record(ctx.get('userQuestions'));
      const agent = liveRoot(sessionId);
      if (typeof service?.['answer'] !== 'function' || agent === undefined) return false;
      return service['answer'].call(service, agent, callId, answer) === true;
    },
  };
}
