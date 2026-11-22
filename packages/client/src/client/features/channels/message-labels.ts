import { humanAuthorName } from '../../actor-names.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { BotSummary, ChannelMessage, ChannelSummary } from '../../store.js';

export function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

export function quoteSource(message: ChannelMessage, text?: string): string {
  return (
    text ??
    (message.body.trim().length > 0
      ? message.body
      : (message.attachments ?? []).map((ref) => ref.name).join(', '))
  )
    .replace(/\s+/gu, ' ')
    .trim();
}

export function authorLabel(
  message: ChannelMessage,
  bots: readonly BotSummary[],
  t: BotHarnessTranslate,
  humans?: Pick<ChannelSummary, 'humanMembers'>,
  remoteBot?: ChannelSummary['remoteBot'],
): string {
  switch (message.author.kind) {
    case 'human':
      return humanAuthorName(message.author, humans, t);
    case 'system':
      return t('main.author.system');
    case 'bot': {
      const { slug, displayName } = message.author;
      return bots.some((bot) => bot.slug === slug)
        ? memberName(bots, slug)
        : (displayName ?? t('team.someBot'));
    }
    case 'remote-bot':
      return remoteBot?.hostId === message.author.hostId &&
        remoteBot.botSlug === message.author.slug
        ? remoteBot.displayName
        : message.author.slug;
    case 'bridged':
      return message.author.source;
  }
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();
function timeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = timeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale || undefined, options);
    timeFormats.set(key, format);
  }
  return format;
}

function clockTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return timeFormat('', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function fullTime(at: string, t: BotHarnessTranslate): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return timeFormat(t('main.date.locale'), {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

export function quotableMessage(message: ChannelMessage): boolean {
  return (
    message.pending !== true &&
    message.streaming !== true &&
    message.failed === undefined &&
    (message.body.trim().length > 0 || (message.attachments?.length ?? 0) > 0) &&
    !message.id.startsWith('local-')
  );
}

export function bubbleStamp(message: ChannelMessage): string | undefined {
  if (message.pending === true || message.streaming === true || message.failed !== undefined)
    return undefined;
  const clock = clockTime(message.at);
  return clock === '' ? undefined : clock;
}
