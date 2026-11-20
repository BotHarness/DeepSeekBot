import type { WireAdministrativeBot } from '@botharness/host-protocol/wire';
import { HostAnswerInvalid, record, text } from './host-answer';

export function readAdministrativeBot(value: unknown, method: string): WireAdministrativeBot {
  const bot = record(value);
  if (
    !text(bot?.['slug']) ||
    bot['slug'].length === 0 ||
    !text(bot['displayName']) ||
    !text(bot['ownerHumanId']) ||
    typeof bot['owner'] !== 'boolean' ||
    typeof bot['paused'] !== 'boolean' ||
    !text(bot['createdAt'])
  )
    throw new HostAnswerInvalid(`${method} returned invalid administrative Bot metadata.`);
  return {
    slug: bot['slug'],
    displayName: bot['displayName'],
    ownerHumanId: bot['ownerHumanId'],
    owner: bot['owner'],
    paused: bot['paused'],
    createdAt: bot['createdAt'],
  };
}
