import {
  sessionModelChoice,
  type SessionModelChoice,
  type SessionModelState,
} from '@botharness/host-protocol/session-model';
import { answerRecord, HostAnswerInvalid, record, some, type HostCall } from './host-answer';

interface OwnedSessionRow {
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  createdAt: string;
  displayTitle?: string;
  currentOrchestrator: boolean;
}

function ownedSessionRow(value: unknown): OwnedSessionRow | undefined {
  const row = record(value);
  const role = row?.['role'];
  const sessionId = row?.['sessionId'];
  const createdAt = row?.['createdAt'];
  const displayTitle = row?.['displayTitle'];
  if (
    (role !== 'orchestrator' && role !== 'assignment') ||
    typeof sessionId !== 'string' ||
    sessionId === '' ||
    typeof createdAt !== 'string' ||
    !Number.isFinite(Date.parse(createdAt))
  )
    return undefined;
  return {
    role,
    sessionId,
    createdAt,
    ...(typeof displayTitle === 'string' && displayTitle.trim() !== '' ? { displayTitle } : {}),
    currentOrchestrator: row?.['currentOrchestrator'] === true,
  };
}

export async function ownedSessions(host: HostCall, slug: string, includeTitles?: boolean) {
  const answer = record(
    await host.call('sessions', {
      slug,
      ...(includeTitles === undefined ? {} : { includeTitles }),
    }),
  );
  return some(answer?.['sessions'], ownedSessionRow);
}

export async function sessionModel(
  host: HostCall,
  slug: string | null,
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
