import { parseAuthor } from '../../bridge-channel-author.js';

import { parseSkillOwner } from '../skills/bridge.js';
import { asRecord } from '../../bridge-transport.js';

import { skillCatalogChangeSchema, type SkillCatalogChange } from '../../bridge.js';

import * as channelHost from '@botharness/host-client/channel-messages';

import { isChannelMessageVoice, type ChannelMessageVoice } from '../../bridge.js';
import { isChannelReplyPreviewMedia } from '../../bridge.js';
import type {
  ChannelMessage,
  ChannelMessageQuote,
  ChannelReplyPreview,
  ChannelReaction,
} from '../../store.js';

export function isMaskedRequest(value: unknown): boolean {
  return asRecord(value)?.['masked'] === true;
}

export function parseSkillInvocations(
  value: unknown,
  body: string,
): NonNullable<ChannelMessage['skillInvocations']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = asRecord(entry);
    const owner = asRecord(item?.['owner']);
    const name = item?.['name'];
    const start = item?.['start'];
    const end = item?.['end'];
    const content = item?.['content'];
    const path = item?.['path'];
    if (
      typeof name !== 'string' ||
      typeof content !== 'string' ||
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      body.slice(start, end) !== '/' + name ||
      (path !== undefined && typeof path !== 'string')
    )
      return [];
    const parsedOwner = parseSkillOwner(owner);
    if (parsedOwner === undefined) return [];
    return [
      {
        name,
        owner: parsedOwner,
        start,
        end,
        content,
        ...(typeof path === 'string' ? { path } : {}),
      },
    ];
  });
}

export function parseSkillCatalogChange(value: unknown): SkillCatalogChange | undefined {
  try {
    const parsed = skillCatalogChangeSchema.safeParse(
      typeof value === 'string' ? JSON.parse(value) : value,
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export { parseSessionLinks } from '@botharness/host-client/session-links';

export function parseMessageVoice(value: unknown): ChannelMessageVoice | undefined {
  return isChannelMessageVoice(value) ? value : undefined;
}

export function parseReactions(value: unknown): ChannelReaction[] | undefined {
  return channelHost.parseReactions(value);
}

export function parsePrivateInputCard(
  value: unknown,
): NonNullable<ChannelMessage['privateInputRequest']> {
  const record = asRecord(value);
  if (
    record === undefined ||
    Object.keys(record).some(
      (key) =>
        !['sessionId', 'account', 'purpose', 'fields', 'expiresAt', 'replacesMessageId'].includes(
          key,
        ),
    ) ||
    (record['sessionId'] === undefined
      ? typeof record['replacesMessageId'] !== 'string'
      : typeof record['sessionId'] !== 'string') ||
    (record['replacesMessageId'] !== undefined &&
      (typeof record['replacesMessageId'] !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(record['replacesMessageId']))) ||
    typeof record['account'] !== 'string' ||
    typeof record['purpose'] !== 'string' ||
    (record['expiresAt'] !== undefined &&
      (typeof record['expiresAt'] !== 'string' ||
        !Number.isFinite(Date.parse(record['expiresAt'])))) ||
    !Array.isArray(record['fields']) ||
    record['fields'].length < 1 ||
    record['fields'].length > 8
  )
    throw new Error('Invalid private input card');
  const fields = record['fields'].map((value: unknown) => {
    const field = asRecord(value);
    if (
      field === undefined ||
      Object.keys(field).some((key) => !['id', 'label', 'required'].includes(key)) ||
      typeof field['id'] !== 'string' ||
      !/^[a-z][a-z0-9_]{0,47}$/.test(field['id']) ||
      typeof field['label'] !== 'string' ||
      typeof field['required'] !== 'boolean'
    )
      throw new Error('Invalid private input field');
    return {
      id: field['id'],
      label: field['label'],
      required: field['required'],
    };
  });
  if (new Set(fields.map((field) => field.id)).size !== fields.length)
    throw new Error('Invalid private input fields');
  return {
    ...(typeof record['sessionId'] === 'string' ? { sessionId: record['sessionId'] } : {}),
    ...(typeof record['replacesMessageId'] === 'string'
      ? { replacesMessageId: record['replacesMessageId'] }
      : {}),
    account: record['account'],
    purpose: record['purpose'],
    fields,
    ...(typeof record['expiresAt'] === 'string' ? { expiresAt: record['expiresAt'] } : {}),
  };
}

function parseQuotePreview(value: unknown): ChannelReplyPreview | null | false {
  if (value === null) return null;
  const preview = asRecord(value);
  if (preview === undefined || typeof preview['body'] !== 'string') return false;
  const author = parseAuthor(preview['author']);
  if (author === undefined) return false;
  const media = preview['media'];
  return {
    author,
    body: preview['body'],
    ...(isChannelReplyPreviewMedia(media) ? { media } : {}),
  };
}

export function parseMessageQuotes(value: unknown): ChannelMessageQuote[] | undefined | false {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) return false;
  const quotes: ChannelMessageQuote[] = [];
  for (const entry of value) {
    const quote = asRecord(entry);
    if (quote === undefined || typeof quote['messageId'] !== 'string') return false;
    if (quote['text'] !== undefined && typeof quote['text'] !== 'string') return false;
    if (quote['note'] !== undefined && typeof quote['note'] !== 'string') return false;
    const preview =
      quote['preview'] === undefined ? undefined : parseQuotePreview(quote['preview']);
    if (preview === false) return false;
    quotes.push({
      messageId: quote['messageId'],
      ...(typeof quote['text'] === 'string' ? { text: quote['text'] } : {}),
      ...(typeof quote['note'] === 'string' ? { note: quote['note'] } : {}),
      ...(preview === undefined ? {} : { preview }),
    });
  }
  return quotes;
}
