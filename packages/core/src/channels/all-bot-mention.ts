import { createHash } from 'node:crypto';
import { isValidSlug } from '../bots/slug.js';
import type { BridgeErrorPreview } from '../kernel/method-utils.js';
import type { ChannelRecord, ChannelMention } from './channel.js';

export type AllBotPreview = BridgeErrorPreview;
export interface AllBotMention {
  start: number;
  end: number;
  label: string;
  preview: AllBotPreview;
}
export function allBotPreview(
  channel: ChannelRecord,
  active: (slug: string) => boolean,
  displayName: (slug: string) => string | undefined,
): AllBotPreview {
  if (channel.type !== 'group') throw new Error('All Bots requires a Group Channel');
  const recipients = [...new Set(channel.members)]
    .filter(active)
    .sort()
    .map((botSlug) => ({
      botSlug,
      label: displayName(botSlug) ?? botSlug,
    }));
  return {
    revision: createHash('sha256')
      .update(JSON.stringify([channel.id, recipients]))
      .digest('hex'),
    recipients,
  };
}
export function parseAllBotMention(value: unknown, body: string): AllBotMention {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid All Bots selection');
  const { start, end, label, preview } = value as AllBotMention;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    typeof label !== 'string' ||
    !['所有 Bot', 'All Bots'].includes(label) ||
    body.slice(start, end) !== '@' + label ||
    typeof preview !== 'object' ||
    preview === null ||
    typeof preview.revision !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(preview.revision) ||
    !Array.isArray(preview.recipients) ||
    preview.recipients.length > 4096 ||
    !preview.recipients.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.botSlug === 'string' &&
        isValidSlug(item.botSlug) &&
        typeof item.label === 'string' &&
        item.label.length > 0 &&
        item.label.length <= 255,
    )
  )
    throw new Error('Invalid All Bots selection');
  return {
    start,
    end,
    label,
    preview: {
      revision: preview.revision,
      recipients: preview.recipients.map(({ botSlug, label }) => ({ botSlug, label })),
    },
  };
}
export function expandAllBotMention(
  body: string,
  mentions: ChannelMention[],
  selection: AllBotMention,
) {
  if (mentions.some((item) => item.start < selection.end && selection.start < item.end))
    throw new Error('Overlapping All Bots selection');
  let replacement = '';
  const expanded: ChannelMention[] = [];
  for (const recipient of selection.preview.recipients) {
    if (replacement.length > 0) replacement += ' ';
    const start = selection.start + replacement.length;
    replacement += '@' + recipient.label;
    expanded.push({ ...recipient, start, end: selection.start + replacement.length });
  }
  const delta = replacement.length - (selection.end - selection.start);
  return {
    body: body.slice(0, selection.start) + replacement + body.slice(selection.end),
    mentions: [
      ...mentions.map((item) =>
        item.start >= selection.end
          ? { ...item, start: item.start + delta, end: item.end + delta }
          : item,
      ),
      ...expanded,
    ].sort((a, b) => a.start - b.start),
  };
}

export class AllBotPreviewChangedError extends Error {
  constructor(readonly preview: AllBotPreview) {
    super(
      'All Bots recipients changed (' +
        preview.recipients.length +
        ' Bots); review the updated count and send again',
    );
  }
}
export function assertAllBotPreview(current: AllBotPreview, expected: AllBotPreview): void {
  if (current.recipients.length === 0 || JSON.stringify(current) !== JSON.stringify(expected))
    throw new AllBotPreviewChangedError(current);
}
