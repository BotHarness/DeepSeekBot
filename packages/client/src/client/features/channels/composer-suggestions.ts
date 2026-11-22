import type { ComposerQuote } from '../../composer-draft-store.js';
import type { MentionQuery, SelectedMention } from '../../mentions.js';
import { botNameSource } from '../../bot-primary-color.js';
import type { BotSummary, ChannelSummary } from '../../store.js';
import type { ChannelRefQuery } from '../../channel-refs.js';
import type { SelectedSkill, SkillQuery } from '../../skill-refs.js';
import type { ComposerSessionOption } from '../../session-refs.js';
import type { ComposerSkillOption } from '../../channel-composer.js';
import type { ChannelComposerUpload } from './composer-types.js';

export const NO_QUOTES: readonly ComposerQuote[] = [];
export const NONE: readonly never[] = [];

const IMAGE_ATTACHMENT_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/iu;

export function isImageAttachment(file: File): boolean {
  return (
    file.type.toLocaleLowerCase().startsWith('image/') || IMAGE_ATTACHMENT_EXTENSION.test(file.name)
  );
}

export function matchingSkills(
  skillQuery: SkillQuery | undefined,
  skillOptions: readonly ComposerSkillOption[],
  rankSkillEntries: <T extends ComposerSkillOption>(
    options: readonly T[],
    query: string,
    labels: (item: T) => string[],
  ) => T[],
) {
  return skillQuery === undefined
    ? []
    : rankSkillEntries(skillOptions, skillQuery.query, (option) =>
        option.owner.kind === 'host'
          ? []
          : option.owner.kind === 'workspace'
            ? [option.owner.name]
            : [option.bot?.displayName ?? option.owner.botSlug, option.owner.botSlug],
      ).slice(0, 8);
}

export function composerChipBots(
  mentionCandidates: readonly BotSummary[],
  skillOptions: readonly ComposerSkillOption[],
  sessionOptions: readonly ComposerSessionOption[],
) {
  return [
    ...mentionCandidates,
    ...skillOptions.flatMap((option) =>
      option.bot === undefined ||
      mentionCandidates.some((candidate) => candidate.slug === option.bot!.slug)
        ? []
        : [option.bot],
    ),
    ...sessionOptions.flatMap((option) => (option.bot === undefined ? [] : [option.bot])),
  ].filter((bot, index, all) => all.findIndex((item) => item.slug === bot.slug) === index);
}

export function matchingBots(
  mentionQuery: MentionQuery | undefined,
  mentionCandidates: readonly BotSummary[],
) {
  return mentionQuery === undefined
    ? []
    : mentionCandidates
        .filter(
          (bot) =>
            !bot.paused &&
            !bot.deleted &&
            (bot.displayName.toLocaleLowerCase().includes(mentionQuery.query.toLocaleLowerCase()) ||
              bot.slug.toLocaleLowerCase().includes(mentionQuery.query.toLocaleLowerCase())),
        )
        .slice(0, 8);
}

export function matchingChannels(
  channelQuery: ChannelRefQuery | undefined,
  channelCandidates: readonly ChannelSummary[],
) {
  return channelQuery === undefined
    ? []
    : channelCandidates
        .filter((channel) =>
          channel.name.toLocaleLowerCase().includes(channelQuery.query.toLocaleLowerCase()),
        )
        .slice(0, 8);
}

export function composerAvatarKey(
  mentions: readonly SelectedMention[],
  skills: readonly SelectedSkill[],
  sessionOptions: readonly ComposerSessionOption[],
  chipBots: readonly BotSummary[],
) {
  return [
    ...mentions.map((mention) => mention.botSlug),
    ...skills.flatMap((skill) => (skill.owner.kind === 'bot' ? [skill.owner.botSlug] : [])),
    ...sessionOptions.map((option) => option.sessionId + '>' + option.botSlug + '>' + option.title),
  ]
    .map((slug) => {
      const bot = chipBots.find((candidate) => candidate.slug === slug);
      return [slug, bot?.displayName, bot?.avatar, botNameSource(bot)].join(':');
    })
    .join('|');
}

export function composerAttachmentKey(attachments: readonly ChannelComposerUpload[]) {
  return attachments
    .map((item) =>
      [
        item.id,
        item.status,
        item.ref?.fileId,
        item.ref?.hash,
        item.ref?.size,
        item.file.name,
        item.file.size,
      ].join(':'),
    )
    .join('|');
}
