import {
  asNonBlank,
  asObject,
  invalidInput,
  unknownBot,
  unknownChannel,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import {
  assertQuoteTargets,
  ChannelQuoteError,
  parseQuotesInput,
  sameQuoteIntent,
} from '../../channels/quotes.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { GenuiError, parseGenuiContent, validateGenuiMessageReply } from '../../channels/genui.js';
import { buildGenuiReplyContext } from '../../channels/genui-message.js';
import {
  parseAllBotMention,
  expandAllBotMention,
  assertAllBotPreview,
  AllBotPreviewChangedError,
  type AllBotMention,
} from '../../channels/all-bot-mention.js';
import { AssignmentReplyTargetError } from '../../runtime/assignment-human-context.js';
import { attachmentIntent } from '../../attachments/ref.js';
import { randomUUID } from 'node:crypto';
import {
  isChannelCallVisual,
  isChannelVoiceCallMessage,
  isValidChannelId,
  isSkillInvocationToken,
  type ChannelMention,
  type ChannelMessage,
  type ChannelReference,
  type ChannelSkillInvocation,
  type ChannelSkillInvocationToken,
} from '../../channels/channel.js';
import { ChannelMentionTargetError, ChannelReplyTargetError } from '../../channels/store.js';
import { ChannelAttachmentError } from '../../attachments/store.js';
import { isChannelAttachmentRef } from '../../attachments/ref.js';
import type { ChannelAttachmentRef } from '../../attachments/ref.js';
import {
  SkillContentTooLargeError,
  skillOwnerKey,
  type ResolvedSkill,
} from '../../skills/catalog.js';
import { isValidSlug } from '../../bots/slug.js';
import type { DmAdmissionFailure } from '../../runtime/bot-runtime.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import type { ChannelRecord } from '../../channels/channel.js';

function dmAdmissionFailure(
  channelId: string,
  botSlug: string | undefined,
  reason: DmAdmissionFailure,
): BridgeResult<never> {
  switch (reason) {
    case 'unknown-channel':
      return unknownChannel(channelId);
    case 'not-dm':
      return invalidInput('Bot runtime accepts only PersonaBot DM messages');
    case 'unknown-bot':
      return unknownBot(botSlug ?? channelId);
    case 'archived-bot':
      return {
        ok: false,
        error: {
          code: 'bot-archived',
          message: `PersonaBot is archived: ${botSlug ?? channelId}`,
        },
      };
    case 'blank-body':
      return invalidInput('body is required');
    case 'cli-request-expired':
      return {
        ok: false,
        error: { code: reason, message: 'Typed CLI requests cannot be replayed.' },
      };
    case 'runtime-closed':
      return {
        ok: false,
        error: { code: 'unavailable', message: 'Bot runtime is closed' },
      };
  }
}

const MAX_CHANNEL_SEND_ATTACHMENTS = 10;

const MAX_SKILL_INVOCATIONS = 5;

function ownAttachments(
  message: ChannelMessage,
  requested: ChannelMessage['voiceCall'],
): readonly ChannelAttachmentRef[] {
  const attachments = message.attachments ?? [];
  const visual = message.voiceCall?.visual;
  return requested === undefined &&
    message.voiceCall?.atMs !== undefined &&
    visual !== undefined &&
    'frames' in visual
    ? attachments.slice(0, -1)
    : attachments;
}

export interface ChannelsSendAdapterMethods {
  channelSend(payload: unknown): Promise<BridgeResult<{ message: ChannelMessage }>>;
}

export function createChannelsSendAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  globalRegistry: BridgeMethodsDeps['registry'],
  channelSkillBots: (channel: ChannelRecord) => string[],
): ChannelsSendAdapterMethods {
  return {
    async channelSend(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const rawBody = source['body'];
      const attachments = source['attachments'];
      if (
        attachments !== undefined &&
        (!Array.isArray(attachments) ||
          attachments.length > MAX_CHANNEL_SEND_ATTACHMENTS ||
          !attachments.every(isChannelAttachmentRef))
      )
        return invalidInput('invalid attachments');
      if (
        typeof rawBody !== 'string' ||
        (rawBody.trim().length === 0 && (!attachments || attachments.length === 0))
      )
        return invalidInput('body is required');
      let body: string = rawBody;
      const rawMentions = source['mentions'];
      if (rawMentions !== undefined && !Array.isArray(rawMentions))
        return invalidInput('mentions must be selected PersonaBot tokens');
      const mentions: ChannelMention[] = [];
      if (Array.isArray(rawMentions)) {
        if (rawMentions.length > 20) return invalidInput('too many mentions');
        for (const item of rawMentions) {
          if (typeof item !== 'object' || item === null)
            return invalidInput('invalid mention token');
          const token = item as Record<string, unknown>;
          const { botSlug, label, start, end } = token;
          if (
            typeof botSlug !== 'string' ||
            !isValidSlug(botSlug) ||
            typeof label !== 'string' ||
            label.length === 0 ||
            typeof start !== 'number' ||
            !Number.isSafeInteger(start) ||
            typeof end !== 'number' ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            end <= start ||
            typeof body !== 'string' ||
            body.slice(start, end) !== '@' + label
          )
            return invalidInput('invalid mention token');
          mentions.push({ botSlug, label, start, end });
        }
        mentions.sort((a, b) => a.start - b.start);
        if (mentions.some((item, index) => index > 0 && item.start < mentions[index - 1]!.end))
          return invalidInput('overlapping mention tokens');
      }
      const rawAllBotMention = source['allBotMention'];
      let allBotMention: AllBotMention | undefined;
      if (rawAllBotMention !== undefined) {
        try {
          allBotMention = parseAllBotMention(rawAllBotMention, body);
        } catch (error) {
          return invalidInput((error as Error).message);
        }
      }
      const rawRefs = source['channelRefs'];
      if (rawRefs !== undefined && !Array.isArray(rawRefs))
        return invalidInput('channelRefs must be selected #Channel tokens');
      const channelRefs: ChannelReference[] = [];
      if (Array.isArray(rawRefs)) {
        if (rawRefs.length > 20) return invalidInput('too many Channel references');
        for (const item of rawRefs) {
          if (typeof item !== 'object' || item === null)
            return invalidInput('invalid Channel reference token');
          const { channelId: targetId, label, start, end } = item as Record<string, unknown>;
          if (
            typeof targetId !== 'string' ||
            !isValidChannelId(targetId) ||
            typeof label !== 'string' ||
            label.length === 0 ||
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            (start as number) < 0 ||
            (end as number) <= (start as number) ||
            body.slice(start as number, end as number) !== '#' + label
          )
            return invalidInput('invalid Channel reference token');
          channelRefs.push({
            channelId: targetId,
            label,
            start: start as number,
            end: end as number,
          });
        }
        channelRefs.sort((a, b) => a.start - b.start);
        if (
          channelRefs.some((item, index) => index > 0 && item.start < channelRefs[index - 1]!.end)
        )
          return invalidInput('overlapping Channel references');
        if (
          channelRefs.some((ref) =>
            mentions.some((mention) => ref.start < mention.end && mention.start < ref.end),
          )
        )
          return invalidInput('overlapping selected tokens');
      }
      const rawSkills = source['skillInvocations'];
      if (rawSkills !== undefined && !Array.isArray(rawSkills))
        return invalidInput('skillInvocations must be selected /Skill tokens');
      const skillTokens: ChannelSkillInvocationToken[] = [];
      if (Array.isArray(rawSkills)) {
        if (rawSkills.length > MAX_SKILL_INVOCATIONS) return invalidInput('too many Skills');
        for (const item of rawSkills) {
          if (!isSkillInvocationToken(item, body)) return invalidInput('invalid Skill token');
          const owner =
            item.owner.kind === 'host'
              ? ({ kind: 'host' } as const)
              : item.owner.kind === 'bot'
                ? ({ kind: 'bot', botSlug: item.owner.botSlug } as const)
                : ({
                    kind: 'workspace',
                    workspaceId: item.owner.workspaceId,
                    name: item.owner.name,
                  } as const);
          skillTokens.push({ name: item.name, owner, start: item.start, end: item.end });
        }
        skillTokens.sort((a, b) => a.start - b.start);
        if (
          skillTokens.some((item, index) => index > 0 && item.start < skillTokens[index - 1]!.end)
        )
          return invalidInput('overlapping Skill tokens');
        if (
          skillTokens.some((skill) =>
            [...mentions, ...channelRefs].some(
              (token) => skill.start < token.end && token.start < skill.end,
            ),
          )
        )
          return invalidInput('overlapping selected tokens');
      }
      if (allBotMention !== undefined) {
        try {
          const expanded = expandAllBotMention(body, mentions, allBotMention);
          const delta = expanded.body.length - body.length;
          for (const token of [...channelRefs, ...skillTokens]) {
            if (token.start < allBotMention.end && allBotMention.start < token.end)
              return invalidInput('overlapping selected tokens');
            if (token.start >= allBotMention.end) {
              token.start += delta;
              token.end += delta;
            }
          }
          body = expanded.body;
          mentions.splice(0, mentions.length, ...expanded.mentions);
        } catch (error) {
          return invalidInput((error as Error).message);
        }
      }
      const rawReplyTo = source['replyTo'];
      if (rawReplyTo !== undefined && (typeof rawReplyTo !== 'string' || rawReplyTo.length === 0)) {
        return invalidInput('replyTo must be a message id');
      }
      let replyTo = typeof rawReplyTo === 'string' ? rawReplyTo : undefined;
      const quotes = parseQuotesInput(source['quotes']);
      if (typeof quotes === 'string') return invalidInput(quotes);
      const rawGrantResolution = source['grantRequestResolution'];
      let grantRequestResolution: ChannelMessage['grantRequestResolution'];
      if (rawGrantResolution !== undefined) {
        if (typeof rawGrantResolution !== 'object' || rawGrantResolution === null)
          return invalidInput('invalid Grant request resolution');
        const resolution = rawGrantResolution as Record<string, unknown>;
        if (
          typeof resolution['requestMessageId'] !== 'string' ||
          resolution['requestMessageId'].length === 0 ||
          typeof resolution['grantId'] !== 'string' ||
          resolution['grantId'].length === 0 ||
          replyTo !== resolution['requestMessageId']
        )
          return invalidInput('invalid Grant request resolution');
        grantRequestResolution = {
          requestMessageId: resolution['requestMessageId'],
          grantId: resolution['grantId'],
        };
      }
      const requestedMessageId = source['messageId'];
      const rawVoiceCall = source['voiceCall'];
      let voiceCall: ChannelMessage['voiceCall'];
      if (rawVoiceCall !== undefined) {
        const callId =
          typeof rawVoiceCall === 'object' && rawVoiceCall !== null
            ? (rawVoiceCall as Record<string, unknown>)['callId']
            : undefined;
        if (typeof callId !== 'string' || !/^call-[a-f0-9]{16}$/u.test(callId))
          return invalidInput('voiceCall must name a call');
        const visual = (rawVoiceCall as Record<string, unknown>)['visual'];
        if (visual !== undefined && !isChannelCallVisual(visual))
          return invalidInput('voiceCall.visual must describe the call grid');
        if (!isChannelVoiceCallMessage(rawVoiceCall))
          return invalidInput(
            'voiceCall takes callId, visual and either speechFromMs/speechToMs or atMs in ms from call connect',
          );
        const { speechFromMs, speechToMs, atMs } = rawVoiceCall;
        voiceCall = {
          callId,
          ...(speechFromMs === undefined || speechToMs === undefined
            ? {}
            : { speechFromMs, speechToMs }),
          ...(atMs === undefined ? {} : { atMs }),
          ...(visual === undefined ? {} : { visual }),
        };
      }
      const rawAssignmentReply = source['assignmentReply'];
      let assignmentReply: ChannelMessage['assignmentReply'];
      if (rawAssignmentReply !== undefined) {
        if (typeof rawAssignmentReply !== 'object' || rawAssignmentReply === null)
          return invalidInput('invalid Assignment response');
        const target = rawAssignmentReply as Record<string, unknown>;
        if (
          typeof target['sessionId'] !== 'string' ||
          target['sessionId'].length === 0 ||
          target['sessionId'].length > 150 ||
          typeof target['sourceEventId'] !== 'string' ||
          target['sourceEventId'].length === 0 ||
          target['sourceEventId'].length > 150 ||
          replyTo !== undefined ||
          grantRequestResolution !== undefined
        )
          return invalidInput('invalid Assignment response');
        assignmentReply = {
          sessionId: target['sessionId'],
          sourceEventId: target['sourceEventId'],
        };
      }
      if (
        requestedMessageId !== undefined &&
        (typeof requestedMessageId !== 'string' ||
          !/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
            requestedMessageId,
          ))
      ) {
        return invalidInput('messageId must be a Human client message id');
      }
      const channel = deps.channels.get(channelId);
      if (channel === undefined) return unknownChannel(channelId);
      let genuiReply: ChannelMessage['genuiReply'];
      let genuiReplyContext: ChannelMessage['genuiReplyContext'];
      if (source['genuiReply'] !== undefined) {
        try {
          if (requestedMessageId === undefined || rawBody.length > 2000)
            throw new GenuiError(
              'invalid-genui',
              'A stable messageId and a request of at most 2000 characters are required.',
            );
          const raw = source['genuiReply'];
          const parsed =
            typeof raw === 'object' &&
            raw !== null &&
            'messageId' in raw &&
            typeof raw.messageId === 'string'
              ? deps.channels.message(channelId, raw.messageId)
              : undefined;
          if (channel.type !== 'dm' || channel.botSlug === undefined || parsed?.genui === undefined)
            throw new GenuiError(
              'genui-unavailable',
              'The report is unavailable in this Human DM.',
            );
          const report = parseGenuiContent(parsed.genui);
          genuiReply = validateGenuiMessageReply(report, raw);
          if (replyTo !== undefined && replyTo !== parsed.id)
            throw new GenuiError('invalid-genui', 'The reply target must be the report message.');
          replyTo = parsed.id;
          genuiReplyContext = buildGenuiReplyContext(report, genuiReply, parsed.id);
        } catch (error) {
          if (error instanceof GenuiError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (channel.type === 'dm' && channel.botSlug === undefined && !channel.humanParticipants)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');
      if (
        replyTo !== undefined &&
        deps.channels.readHumanTimeline(human, channelId, {
          direction: 'around',
          around: replyTo,
          olderLimit: 0,
          newerLimit: 0,
        }) === undefined
      )
        return invalidInput('Reply target must exist in this Channel');
      try {
        if (
          requestedMessageId === undefined ||
          deps.channels.message(channelId, requestedMessageId) === undefined
        )
          assertQuoteTargets(quotes, (messageId) =>
            deps.channels
              .readHumanTimeline(human, channelId, {
                direction: 'around',
                around: messageId,
                olderLimit: 0,
                newerLimit: 0,
              })
              ?.entries.find((entry) => entry.id === messageId),
          );
      } catch (error) {
        if (error instanceof ChannelQuoteError)
          return { ok: false, error: { code: error.code, message: error.message } };
        throw error;
      }
      const memorySwitchTarget = source['memorySwitchTarget'];
      if (
        memorySwitchTarget !== undefined &&
        (typeof memorySwitchTarget !== 'string' ||
          memorySwitchTarget.length === 0 ||
          memorySwitchTarget.length > 255 ||
          channel.type !== 'dm')
      )
        return invalidInput('memorySwitchTarget requires a DM and a branch name');
      const existing =
        requestedMessageId === undefined
          ? undefined
          : deps.channels.message(channelId, requestedMessageId);
      if (existing !== undefined) {
        const same =
          existing.author.kind === 'human' &&
          (existing.author.humanId ?? OWNER_HUMAN_CONTEXT.humanId) === human.humanId &&
          ((existing.body === body && existing.genuiReplyContext === genuiReplyContext) ||
            (existing.genuiReplyContext === undefined &&
              genuiReplyContext !== undefined &&
              existing.body === `${body}\n\n${genuiReplyContext}`)) &&
          existing.replyTo === replyTo &&
          sameQuoteIntent(deps.channels.storedQuotes(channelId, existing.id), quotes) &&
          JSON.stringify(existing.genuiReply) === JSON.stringify(genuiReply) &&
          existing.memorySwitchTarget === memorySwitchTarget &&
          JSON.stringify(existing.assignmentReply) === JSON.stringify(assignmentReply) &&
          JSON.stringify(attachmentIntent(ownAttachments(existing, voiceCall))) ===
            JSON.stringify(attachmentIntent(attachments ?? [])) &&
          JSON.stringify(existing.mentions ?? []) === JSON.stringify(mentions) &&
          JSON.stringify(existing.channelRefs ?? []) === JSON.stringify(channelRefs) &&
          JSON.stringify(
            (existing.skillInvocations ?? []).map(({ name, owner, start, end }) => ({
              name,
              owner: skillOwnerKey(owner),
              start,
              end,
            })),
          ) ===
            JSON.stringify(
              skillTokens.map(({ name, owner, start, end }) => ({
                name,
                owner: skillOwnerKey(owner),
                start,
                end,
              })),
            ) &&
          JSON.stringify(existing.grantRequestResolution) ===
            JSON.stringify(grantRequestResolution);
        return same
          ? { ok: true, value: { message: existing } }
          : invalidInput('messageId already belongs to different Channel content');
      }
      if (allBotMention !== undefined) {
        try {
          assertAllBotPreview(deps.channels.previewAllBotMention(channelId), allBotMention.preview);
        } catch (error) {
          if (error instanceof AllBotPreviewChangedError)
            return {
              ok: false,
              error: {
                code: 'all-bot-preview-changed',
                message: error.message,
                details: { preview: error.preview },
              },
            };
          return invalidInput((error as Error).message);
        }
      }
      const grantRequestTarget =
        replyTo === undefined ? undefined : deps.channels.message(channelId, replyTo);
      if (
        assignmentReply !== undefined &&
        (channel.type !== 'dm' ||
          channel.botSlug === undefined ||
          deps.humanAttention?.assignmentContext(
            channel.botSlug,
            assignmentReply.sessionId,
            assignmentReply.sourceEventId,
          )?.canReply !== true)
      )
        return invalidInput('Assignment request is no longer awaiting this Human response');
      if (
        grantRequestResolution === undefined &&
        grantRequestTarget?.grantRequest === true &&
        (body.startsWith('已授权工作区「') || body.startsWith('I authorized workspace “'))
      )
        return invalidInput('Grant approval replies must reference an active Workspace Grant');
      if (grantRequestResolution !== undefined) {
        const requester =
          grantRequestTarget?.grantRequest === true && grantRequestTarget.author.kind === 'bot'
            ? grantRequestTarget.author.slug
            : undefined;
        if (
          requester === undefined ||
          (channel.type === 'dm'
            ? channel.botSlug !== requester
            : !channel.members.includes(requester))
        )
          return invalidInput('Grant request is unavailable in this Channel');
        if (
          !deps.grants
            ?.list(requester)
            .some(
              (grant) =>
                grant.id === grantRequestResolution.grantId && grant.revokedAt === undefined,
            )
        )
          return invalidInput('Workspace Grant is no longer active for this PersonaBot');
      }
      if (mentions.length > 0 && channel.type === 'dm' && channel.botSlug === undefined)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');
      for (const mention of mentions) {
        const target = globalRegistry.get(mention.botSlug);
        if (
          (channel.type === 'group'
            ? !channel.members.includes(mention.botSlug)
            : mention.botSlug === channel.botSlug ||
              deps.team?.bots.canReach(human, mention.botSlug) === false) ||
          target === undefined ||
          target.paused === true
        )
          return invalidInput('Mentioned PersonaBot is no longer an eligible active Bot');
      }
      if (channelRefs.length > 0) {
        if (channel.type !== 'dm' || channel.botSlug === undefined)
          return invalidInput('#Channel references require a Human–Bot DM');
        for (const ref of channelRefs) {
          const target = deps.channels.get(ref.channelId);
          if (target?.type !== 'group')
            return invalidInput('Referenced Group Channel is no longer available');
        }
      }
      if (
        channel.type === 'dm' &&
        channel.botSlug !== undefined &&
        ((globalRegistry.getHistorical(channel.botSlug) !== undefined &&
          globalRegistry.get(channel.botSlug) === undefined) ||
          globalRegistry.get(channel.botSlug)?.paused === true)
      ) {
        return dmAdmissionFailure(channelId, channel.botSlug, 'archived-bot');
      }
      const skillInvocations: ChannelSkillInvocation[] = [];
      const skillBots = skillTokens.length === 0 ? [] : channelSkillBots(channel);
      const skillViewer = skillBots[0];
      for (const token of skillTokens) {
        let resolved: ResolvedSkill | undefined;
        try {
          resolved =
            skillViewer === undefined ||
            (token.owner.kind === 'bot' && !skillBots.includes(token.owner.botSlug))
              ? undefined
              : await deps.skills?.resolve(token.name, token.owner, skillViewer, skillBots);
        } catch (error) {
          if (error instanceof SkillContentTooLargeError)
            return { ok: false, error: { code: error.code, message: error.message } };
          throw error;
        }
        if (resolved === undefined)
          return {
            ok: false,
            error: {
              code: 'skill-unavailable',
              message: `Skill /${token.name} is no longer available`,
            },
          };
        skillInvocations.push({
          ...token,
          owner: resolved.owner,
          content: resolved.content,
          ...(resolved.path === undefined ? {} : { path: resolved.path }),
        });
      }
      const id = requestedMessageId ?? randomUUID();
      const harvest =
        voiceCall === undefined && channel.type === 'dm' && channel.botSlug !== undefined
          ? await deps.callText?.({
              channelId,
              messageId: id,
              picture: (attachments?.length ?? 0) < MAX_CHANNEL_SEND_ATTACHMENTS,
            })
          : undefined;
      if (harvest !== undefined) voiceCall = harvest.voiceCall;
      const sent = [...(attachments ?? []), ...(harvest?.attachments ?? [])];
      const message: ChannelMessage = {
        id,
        at: new Date().toISOString(),
        author: {
          kind: 'human',
          ...(deps.team?.mode(OWNER_HUMAN_CONTEXT).enabled
            ? {
                humanId: human.humanId,
                displayName: deps.channels.humanIdentity(human).displayName,
              }
            : {}),
        },
        body,
        ...(sent.length === 0 ? {} : { attachments: sent }),
        ...(mentions.length === 0 ? {} : { mentions }),
        ...(channelRefs.length === 0 ? {} : { channelRefs }),
        ...(skillInvocations.length === 0 ? {} : { skillInvocations }),
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(quotes.length === 0 ? {} : { quotes }),
        ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
        ...(assignmentReply === undefined ? {} : { assignmentReply }),
        ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
        ...(voiceCall === undefined ? {} : { voiceCall }),
        ...(genuiReply === undefined ? {} : { genuiReply }),
        ...(genuiReplyContext === undefined ? {} : { genuiReplyContext }),
      };
      let appendResult;
      try {
        appendResult = await deps.channels.appendMessageOnce(
          human,
          channelId,
          message,
          allBotMention?.preview,
        );
        harvest?.settle(appendResult.status === 'appended');
      } catch (error) {
        harvest?.settle(false);
        if (error instanceof AllBotPreviewChangedError)
          return {
            ok: false,
            error: {
              code: 'all-bot-preview-changed',
              message: error.message,
              details: { preview: error.preview },
            },
          };
        if (
          error instanceof ChannelReplyTargetError ||
          error instanceof ChannelQuoteError ||
          error instanceof GenuiError ||
          error instanceof AssignmentReplyTargetError ||
          error instanceof ChannelMentionTargetError ||
          error instanceof ChannelAttachmentError
        )
          return invalidInput(error.message);
        throw error;
      }
      if (appendResult.status === 'missing') return unknownChannel(channelId);
      if (appendResult.status === 'conflict') {
        return invalidInput('messageId already belongs to different Channel content');
      }
      const appended = appendResult.message;
      if (appendResult.status === 'existing') {
        return { ok: true, value: { message: appended } };
      }
      if (channel.type === 'group') {
        try {
          deps.runtime?.admitGroupMessage(channelId, appended.id);
        } catch {}
      }
      if (channel.type === 'dm' && !channel.humanParticipants && deps.runtime !== undefined) {
        const admission = deps.runtime.admitDmMessage(human, {
          channelId,
          messageId: appended.id,
          body:
            appended.body.trim() ||
            `[Attachments: ${appended.attachments?.map((ref) => ref.name).join(', ') ?? ''}]`,
        });
        if (!admission.admitted) {
          return { ok: true, value: { message: appended } };
        }
      }
      return { ok: true, value: { message: appended } };
    },
  };
}
