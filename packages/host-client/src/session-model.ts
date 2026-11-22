import {
  sessionModelChoice,
  type SessionModelChoice,
  type SessionModelState,
} from '@botharness/host-protocol/session-model';
import { isTurnTarget, type TurnTarget } from '@botharness/host-protocol/turn-target';
import { answerRecord, HostAnswerInvalid, record, some, type HostCall } from './host-answer';

export async function ownedSessions(host: HostCall, slug: string) {
  const answer = record(await host.call('sessions', { slug }));
  return some(answer?.['sessions'], record);
}

export async function currentOrchestratorSession(
  host: HostCall,
  slug: string,
): Promise<{ id: string; target?: TurnTarget } | undefined> {
  const current = (await ownedSessions(host, slug)).find(
    (row) => row['role'] === 'orchestrator' && row['currentOrchestrator'] === true,
  );
  const id = current?.['sessionId'];
  if (typeof id !== 'string' || id === '') return undefined;
  const target = current?.['currentTarget'];
  return { id, ...(isTurnTarget(target) ? { target } : {}) };
}

export async function sessionModel(
  host: HostCall,
  slug: string,
  sessionId: string,
  choice?: SessionModelChoice | null,
): Promise<SessionModelState> {
  const result = answerRecord(
    await host.call('sessionModel', {
      slug,
      sessionId,
      ...(choice === undefined ? {} : { choice }),
    }),
    'sessionModel',
  );
  if (!('override' in result) || !('default' in result))
    throw new HostAnswerInvalid('invalid sessionModel response');
  return {
    override: sessionModelChoice(result.override) ?? null,
    default: sessionModelChoice(result.default) ?? null,
    ...(result.active === undefined ? {} : { active: sessionModelChoice(result.active) ?? null }),
  };
}
