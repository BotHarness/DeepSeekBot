import type { PersonaBotSummary } from '@botharness/host-protocol/wire';
import { HostAnswerInvalid, record, text, type HostCall } from './host-answer';

export interface BotDetailAnswer {
  bot: Record<string, unknown> & { slug: string };
  profileFingerprint: string;
}

function botRow(value: unknown, method: string): Record<string, unknown> & { slug: string } {
  const bot = record(value);
  if (!text(bot?.['slug']) || bot['slug'].length === 0)
    throw new HostAnswerInvalid(`${method} returned a Bot without a slug.`);
  return bot as Record<string, unknown> & { slug: string };
}

export function parseBotList(value: unknown): PersonaBotSummary[] {
  const bots = record(value)?.['bots'];
  if (!Array.isArray(bots)) throw new HostAnswerInvalid('list returned no Bots.');
  return bots.flatMap((entry) => {
    const bot = record(entry);
    return text(bot?.['slug']) && bot['slug'].length > 0 && text(bot['displayName'])
      ? [bot as unknown as PersonaBotSummary]
      : [];
  });
}

export async function listBots(
  host: HostCall,
  filter: { query?: string } = {},
): Promise<PersonaBotSummary[]> {
  return parseBotList(
    await host.call('list', filter.query === undefined ? {} : { query: filter.query }),
  );
}

export async function loadBotDetail(host: HostCall, slug: string): Promise<BotDetailAnswer> {
  const answer = record(await host.call('get', { slug }));
  const profileFingerprint = answer?.['profileFingerprint'];
  if (!text(profileFingerprint))
    throw new HostAnswerInvalid('get returned no profile fingerprint.');
  return { bot: botRow(answer?.['bot'], 'get'), profileFingerprint };
}

export async function updateBot(
  host: HostCall,
  slug: string,
  patch: Record<string, unknown>,
  expectedProfile?: string,
): Promise<Record<string, unknown> & { slug: string }> {
  return botRow(
    record(
      await host.call('update', {
        slug,
        patch,
        ...(expectedProfile === undefined ? {} : { expectedProfile }),
      }),
    )?.['bot'],
    'update',
  );
}
