import type {
  HostSessionListOptions,
  HostSessionListResult,
  HostSessionRow,
  HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import { answerRecord, record, HostAnswerInvalid, type HostCall } from './host-answer';

export async function listHostSessions(host: HostCall): Promise<HostSessionRow[]> {
  return (await readHostSessionList(host)).sessions;
}

export async function readHostSessionList(
  host: HostCall,
  options?: HostSessionListOptions,
): Promise<HostSessionListResult> {
  const answer = answerRecord(
    await host.call('sessionList', options === undefined ? {} : { ...options, queryVersion: 1 }),
    'sessionList',
  );
  if (!Array.isArray(answer['sessions']))
    throw new HostAnswerInvalid('invalid sessionList response');
  const sessions = answer['sessions'].flatMap((value): HostSessionRow[] => {
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
  if (answer['queryVersion'] !== 1) {
    if (options?.search || (options?.source && options.source !== 'all'))
      throw new HostAnswerInvalid('Host does not support Session queries');
    return { sessions };
  }
  if (!Array.isArray(answer['sources'])) throw new HostAnswerInvalid('invalid sessionList sources');
  const sources = answer['sources'].flatMap((value): HostSessionSourceOption[] => {
    const option = record(value);
    if (option?.['kind'] === 'native') return [{ kind: 'native' }];
    if (
      option?.['kind'] === 'bot' &&
      typeof option['botSlug'] === 'string' &&
      typeof option['displayName'] === 'string'
    )
      return [{ kind: 'bot', botSlug: option['botSlug'], displayName: option['displayName'] }];
    return [];
  });
  return { sessions, queryVersion: 1, sources };
}
