import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { answerRecord, record, HostAnswerInvalid, type HostCall } from './host-answer';

export async function listHostSessions(host: HostCall): Promise<HostSessionRow[]> {
  const answer = answerRecord(await host.call('sessionList', {}), 'sessionList');
  if (!Array.isArray(answer['sessions']))
    throw new HostAnswerInvalid('invalid sessionList response');
  return answer['sessions'].flatMap((value): HostSessionRow[] => {
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
}
