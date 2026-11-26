import type {
  HostSessionActionReceipt,
  HostSessionApprovalDecision,
  HostSessionCreateRequest,
  HostSessionPendingInput,
  HostSessionListChanges,
  HostSessionListCursor,
  HostSessionListOptions,
  HostSessionListResult,
  HostSessionRow,
  HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import type { QuestionAnswer, QuestionItem, QuestionOption } from '@botharness/host-protocol/wire';
import { answerRecord, record, some, HostAnswerInvalid, type HostCall } from './host-answer';
import { MethodRefused } from './client-errors';

function modelOf(value: Record<string, unknown> | undefined) {
  return typeof value?.['provider'] === 'string' && typeof value['model'] === 'string'
    ? { model: { provider: value['provider'], model: value['model'] } }
    : {};
}

function sessionRows(values: unknown[]): HostSessionRow[] {
  return values.flatMap((value): HostSessionRow[] => {
    const row = record(value);
    const source = record(row?.['source']);
    if (
      row === undefined ||
      source === undefined ||
      typeof row['sessionId'] !== 'string' ||
      typeof row['running'] !== 'boolean' ||
      typeof row['updatedAt'] !== 'number'
    )
      return [];
    const base = {
      sessionId: row['sessionId'],
      running: row['running'],
      updatedAt: row['updatedAt'],
      lastPromptAt: typeof row['lastPromptAt'] === 'number' ? row['lastPromptAt'] : null,
      ...(typeof row['title'] === 'string' ? { title: row['title'] } : {}),
      ...(typeof row['folderName'] === 'string' ? { folderName: row['folderName'] } : {}),
      ...(typeof row['cwd'] === 'string' ? { cwd: row['cwd'] } : {}),
      ...(row['waiting'] === true ? { waiting: true as const } : {}),
      ...(row['archived'] === true ? { archived: true as const } : {}),
      ...(typeof row['sortedAt'] === 'number' ? { sortedAt: row['sortedAt'] } : {}),
      ...(typeof row['createdAt'] === 'number' ? { createdAt: row['createdAt'] } : {}),
      ...modelOf(record(row['model'])),
    };
    if (source['kind'] === 'native') return [{ ...base, source: { kind: 'native' } }];
    if (
      source['kind'] !== 'bot' ||
      typeof source['botSlug'] !== 'string' ||
      typeof source['displayName'] !== 'string'
    )
      return [];
    return [
      {
        ...base,
        source: {
          kind: 'bot',
          botSlug: source['botSlug'],
          displayName: source['displayName'],
          ...(typeof source['avatar'] === 'string' ? { avatar: source['avatar'] } : {}),
          ...(source['appearance'] === undefined ? {} : { appearance: source['appearance'] }),
          ...(source['avatarSeed'] === 2 ? { avatarSeed: 2 } : {}),
        },
      },
    ];
  });
}

function sessionSources(values: unknown[]): HostSessionSourceOption[] {
  return values.flatMap((value): HostSessionSourceOption[] => {
    const option = record(value);
    if (option?.['kind'] === 'native') return [{ kind: 'native' }];
    if (
      option?.['kind'] === 'bot' &&
      typeof option['botSlug'] === 'string' &&
      typeof option['displayName'] === 'string'
    )
      return [
        {
          kind: 'bot',
          botSlug: option['botSlug'],
          displayName: option['displayName'],
          ...(typeof option['avatar'] === 'string' ? { avatar: option['avatar'] } : {}),
          ...(option['appearance'] === undefined ? {} : { appearance: option['appearance'] }),
          ...(option['avatarSeed'] === 2 ? { avatarSeed: 2 as const } : {}),
        },
      ];
    return [];
  });
}

export async function readHostSessionListChanges(
  host: HostCall,
  cursor: HostSessionListCursor | undefined,
): Promise<HostSessionListChanges> {
  const answer = answerRecord(
    await host.call(
      'sessionListChanges',
      cursor === undefined ? {} : { sinceSeq: cursor.seq, epoch: cursor.epoch },
    ),
    'sessionListChanges',
  );
  const next = record(answer['cursor']);
  if (typeof next?.['epoch'] !== 'string' || !Number.isSafeInteger(next['seq']))
    throw new HostAnswerInvalid('invalid sessionListChanges cursor');
  const nextCursor = { epoch: next['epoch'], seq: next['seq'] as number };
  if (answer['reset'] === true) return { reset: true, cursor: nextCursor };
  if (
    !Array.isArray(answer['sessions']) ||
    !Array.isArray(answer['removed']) ||
    !Array.isArray(answer['sources'])
  )
    throw new HostAnswerInvalid('invalid sessionListChanges response');
  return {
    sessions: sessionRows(answer['sessions']),
    removed: answer['removed'].filter((id): id is string => typeof id === 'string'),
    sources: sessionSources(answer['sources']),
    cursor: nextCursor,
  };
}

export async function listHostSessions(host: HostCall): Promise<HostSessionRow[]> {
  return (await readHostSessionList(host)).sessions;
}

export async function readHostSessionList(
  host: HostCall,
  options?: HostSessionListOptions,
): Promise<HostSessionListResult> {
  const { includeArchived, limit, cursor, ...query } = options ?? {};
  const args = (paged: boolean) =>
    options === undefined
      ? {}
      : {
          ...query,
          ...(paged && limit !== undefined ? { limit } : {}),
          ...(paged && cursor !== undefined ? { cursor } : {}),
          queryVersion: 1,
          ...(includeArchived ? { includeArchived } : {}),
        };
  const paged = limit !== undefined || cursor !== undefined;
  const answer = answerRecord(
    await host.call('sessionList', args(paged)).catch((error: unknown) => {
      if (paged && error instanceof MethodRefused && error.code === 'gateway/arguments-invalid')
        return host.call('sessionList', args(false));
      throw error;
    }),
    'sessionList',
  );
  if (!Array.isArray(answer['sessions']))
    throw new HostAnswerInvalid('invalid sessionList response');
  const sessions = sessionRows(answer['sessions']);
  const archived = answer['includeArchived'] === true ? { includeArchived: true as const } : {};
  if (options?.includeArchived === true && answer['includeArchived'] !== true)
    throw new HostAnswerInvalid('Host does not support including archived Sessions');
  if (answer['queryVersion'] !== 1) {
    if (options?.search || (options?.source && options.source !== 'all'))
      throw new HostAnswerInvalid('Host does not support Session queries');
    return { sessions };
  }
  if (!Array.isArray(answer['sources'])) throw new HostAnswerInvalid('invalid sessionList sources');
  const sources = sessionSources(answer['sources']);
  const nextCursor = answer['nextCursor'];
  return {
    sessions,
    queryVersion: 1,
    sources,
    ...archived,
    ...(typeof nextCursor === 'string' && nextCursor !== '' ? { nextCursor } : {}),
  };
}

export async function createHostSession(
  host: HostCall,
  request: HostSessionCreateRequest,
): Promise<{ sessionId: string; requestId: string }> {
  const answer = answerRecord(await host.call('sessionCreate', request), 'sessionCreate');
  if (typeof answer['sessionId'] !== 'string' || typeof answer['requestId'] !== 'string')
    throw new HostAnswerInvalid('invalid sessionCreate response');
  return { sessionId: answer['sessionId'], requestId: answer['requestId'] };
}

function sessionActionReceipt(value: unknown, method: string): HostSessionActionReceipt {
  const answer = answerRecord(value, method);
  if (typeof answer['sessionId'] !== 'string' || answer['accepted'] !== true)
    throw new HostAnswerInvalid(`invalid ${method} response`);
  return { sessionId: answer['sessionId'], accepted: true };
}

export async function answerHostSessionApproval(
  host: HostCall,
  request: { sessionId: string; requestId: string; decision: HostSessionApprovalDecision },
): Promise<HostSessionActionReceipt> {
  return sessionActionReceipt(
    await host.call('sessionAnswerApproval', request),
    'sessionAnswerApproval',
  );
}

export async function answerHostSessionQuestion(
  host: HostCall,
  request: { sessionId: string; requestId: string; answer: QuestionAnswer },
): Promise<HostSessionActionReceipt> {
  return sessionActionReceipt(
    await host.call('sessionAnswerQuestion', request),
    'sessionAnswerQuestion',
  );
}

export async function stopHostSession(
  host: HostCall,
  sessionId: string,
): Promise<HostSessionActionReceipt> {
  return sessionActionReceipt(
    await host.call('sessionNativeStop', { sessionId }),
    'sessionNativeStop',
  );
}

export async function archiveHostSession(
  host: HostCall,
  sessionId: string,
): Promise<HostSessionActionReceipt> {
  return sessionActionReceipt(
    await host.call('sessionNativeArchive', { sessionId }),
    'sessionNativeArchive',
  );
}

function questionOption(value: unknown): QuestionOption | undefined {
  const option = record(value);
  if (typeof option?.['label'] !== 'string') return undefined;
  const { label, description } = option;
  return { label, ...(typeof description === 'string' ? { description } : {}) };
}

function questionItem(value: unknown): QuestionItem | undefined {
  const item = record(value);
  if (typeof item?.['id'] !== 'string' || typeof item['question'] !== 'string') return undefined;
  const { id, question, detail, header, options, multiSelect } = item;
  return {
    id,
    question,
    ...(typeof detail === 'string' ? { detail } : {}),
    ...(typeof header === 'string' ? { header } : {}),
    ...(typeof multiSelect === 'boolean' ? { multiSelect } : {}),
    ...(Array.isArray(options) ? { options: some(options, questionOption) } : {}),
  };
}

function pendingInput(value: unknown): HostSessionPendingInput | undefined {
  const item = record(value);
  if (typeof item?.['requestId'] !== 'string') return undefined;
  const { requestId, kind, toolName, callId, reason, continued } = item;
  if (kind === 'approval' && typeof toolName === 'string')
    return {
      kind,
      requestId,
      toolName,
      ...(typeof callId === 'string' ? { callId } : {}),
      ...(typeof reason === 'string' ? { reason } : {}),
    };
  if (kind !== 'question' || !Array.isArray(item['questions'])) return undefined;
  const questions = some(item['questions'], questionItem);
  if (questions.length === 0 || questions.length !== item['questions'].length) return undefined;
  return { kind, requestId, questions, ...(continued === true ? { continued } : {}) };
}

export function hostSessionPendingInput(value: unknown): HostSessionPendingInput[] | undefined {
  return Array.isArray(value) ? some(value, pendingInput) : undefined;
}
