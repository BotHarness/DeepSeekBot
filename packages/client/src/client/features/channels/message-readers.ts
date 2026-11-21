import { parseAuthor } from '../../bridge-channel-author.js';
import { parseApprovalCard } from '../approvals/bridge.js';

import { asRecord } from '../../bridge-transport.js';
import { parseToolEffects } from '../../bridge.js';

import { isTakeoverRequestCard, isTakeoverResolution } from '../../bridge.js';
import {
  parseFailureAutoContinue,
  parseFailureProgress,
} from '@botharness/host-client/shared/turn-continuation';

import { genuiReplySchema, parseGenuiContent } from '../../bridge.js';
import { genuiDocumentReplySchema } from '../../bridge.js';
import { parseToolApprovalActor } from '../../bridge.js';
import { isChannelVoiceCallRecord } from '../../bridge.js';
import { isChannelTurnStopEngine, isChannelTurnStopRests } from '../../bridge.js';
import { isChannelModelSwitch } from '../../bridge.js';
import { parseMessagePerf } from '../../message-perf.js';
import { isChannelClearedAttachment } from '../../bridge.js';

import { isChannelReplyPreviewMedia } from '../../bridge.js';
import type { ChannelAttachmentRef, ChannelMessage, UserQuestionAnswerItem } from '../../store.js';
import { parseChannelAttachment } from '../channel-files/bridge.js';
import {
  isMaskedRequest,
  parseSkillInvocations,
  parseSessionLinks,
  parseMessageVoice,
  parseReactions,
  parsePrivateInputCard,
  parseMessageQuotes,
} from './message-fields.js';

export function parseChannelMessage(value: unknown): ChannelMessage | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const at = record['at'];
  const body = record['body'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof at !== 'string' || at.length === 0) return undefined;
  if (typeof body !== 'string') return undefined;
  const author = parseAuthor(record['author']);
  if (author === undefined) return undefined;
  let genui: ReturnType<typeof parseGenuiContent> | undefined;
  if (author.kind === 'bot' && record['genui'] !== undefined) {
    try {
      genui = parseGenuiContent(record['genui']);
    } catch {
      genui = undefined;
    }
  }
  const parsedGenuiReply =
    author.kind === 'human' && record['genuiReply'] !== undefined
      ? (asRecord(record['genuiReply'])?.['version'] === 2
          ? genuiDocumentReplySchema
          : genuiReplySchema
        ).safeParse(record['genuiReply'])
      : undefined;
  const genuiReply = parsedGenuiReply?.success ? parsedGenuiReply.data : undefined;
  const perf = author.kind === 'bot' ? parseMessagePerf(record['perf']) : undefined;
  const memorySwitchTarget = record['memorySwitchTarget'];
  if (
    memorySwitchTarget !== undefined &&
    (author.kind !== 'human' ||
      typeof memorySwitchTarget !== 'string' ||
      memorySwitchTarget.length === 0 ||
      memorySwitchTarget.length > 255)
  )
    return undefined;
  const grantRequest = record['grantRequest'];
  if (grantRequest !== undefined && (grantRequest !== true || author.kind !== 'bot'))
    return undefined;
  let grantRequestResolution: ChannelMessage['grantRequestResolution'];
  const sessionLinks = author.kind === 'bot' ? parseSessionLinks(record['sessionLinks']) : [];
  let assignmentReply: ChannelMessage['assignmentReply'];
  if (record['assignmentReply'] !== undefined) {
    const target = asRecord(record['assignmentReply']);
    if (
      target === undefined ||
      author.kind !== 'human' ||
      typeof target['sessionId'] !== 'string' ||
      target['sessionId'].length === 0 ||
      typeof target['sourceEventId'] !== 'string' ||
      target['sourceEventId'].length === 0
    )
      return undefined;
    assignmentReply = {
      sessionId: target['sessionId'],
      sourceEventId: target['sourceEventId'],
    };
  }
  if (record['grantRequestResolution'] !== undefined) {
    const resolution = asRecord(record['grantRequestResolution']);
    if (
      resolution === undefined ||
      author.kind !== 'human' ||
      typeof resolution['requestMessageId'] !== 'string' ||
      typeof resolution['grantId'] !== 'string' ||
      resolution['requestMessageId'].length === 0 ||
      resolution['grantId'].length === 0 ||
      record['replyTo'] !== resolution['requestMessageId']
    )
      return undefined;
    grantRequestResolution = {
      requestMessageId: resolution['requestMessageId'],
      grantId: resolution['grantId'],
    };
  }
  const approval = author.kind === 'bot' ? parseApprovalCard(record['approval']) : undefined;
  let toolApprovalRequest: ChannelMessage['toolApprovalRequest'];
  if (
    record['toolApprovalRequest'] !== undefined &&
    !isMaskedRequest(record['toolApprovalRequest'])
  ) {
    const request = asRecord(record['toolApprovalRequest']);
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      typeof request['callId'] !== 'string' ||
      typeof request['toolName'] !== 'string' ||
      typeof request['cwd'] !== 'string' ||
      typeof request['input'] !== 'string' ||
      (request['role'] !== 'orchestrator' && request['role'] !== 'assignment')
    )
      return undefined;
    const preview = asRecord(request['botCreatePreview']);
    const botCreatePreview =
      preview !== undefined &&
      typeof preview['memoryFolder'] === 'string' &&
      typeof preview['defaultLocation'] === 'boolean'
        ? {
            memoryFolder: preview['memoryFolder'],
            defaultLocation: preview['defaultLocation'],
            ...(typeof preview['avatar'] === 'string' && preview['avatar'].startsWith('data:image/')
              ? { avatar: preview['avatar'] }
              : {}),
            ...(typeof preview['avatarError'] === 'string'
              ? { avatarError: preview['avatarError'] }
              : {}),
          }
        : undefined;
    const effects = parseToolEffects(request['effects']);
    const review = asRecord(request['approvalReview']);
    let approvalReview: import('../../bridge.js').ToolApprovalReview | undefined;
    if (review?.['kind'] === 'template-unavailable' && typeof review['reason'] === 'string')
      approvalReview = {
        kind: 'template-unavailable',
        reason: review['reason'],
      };
    else if (
      review?.['kind'] === 'review' &&
      typeof review['reason'] === 'string' &&
      typeof review['template'] === 'string' &&
      typeof review['version'] === 'string'
    )
      approvalReview = {
        kind: 'review',
        template: review['template'],
        version: review['version'],
        reason: review['reason'],
        ...(typeof review['fallback'] === 'string' ? { fallback: review['fallback'] } : {}),
      };
    toolApprovalRequest = {
      ...(effects === undefined ? {} : { effects }),
      ...(approvalReview === undefined ? {} : { approvalReview }),
      ...(typeof request['allowAlways'] === 'boolean'
        ? { allowAlways: request['allowAlways'] }
        : {}),
      sessionId: request['sessionId'],
      callId: request['callId'],
      toolName: request['toolName'],
      role: request['role'],
      cwd: request['cwd'],
      input: request['input'],
      ...(botCreatePreview === undefined ? {} : { botCreatePreview }),
    };
  }
  let userQuestionRequest: ChannelMessage['userQuestionRequest'];
  if (
    record['userQuestionRequest'] !== undefined &&
    !isMaskedRequest(record['userQuestionRequest'])
  ) {
    const request = asRecord(record['userQuestionRequest']);
    const questions = request?.['questions'];
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      !Array.isArray(questions) ||
      questions.length === 0
    )
      return undefined;
    const parsed = questions.map((value) => {
      const item = asRecord(value);
      if (
        item === undefined ||
        typeof item['id'] !== 'string' ||
        typeof item['question'] !== 'string'
      )
        return undefined;
      const options = item['options'];
      if (
        options !== undefined &&
        (!Array.isArray(options) ||
          !options.every((option) => {
            const row = asRecord(option);
            return (
              row !== undefined &&
              typeof row['label'] === 'string' &&
              (row['description'] === undefined || typeof row['description'] === 'string')
            );
          }))
      )
        return undefined;
      return {
        id: item['id'],
        question: item['question'],
        ...(typeof item['detail'] === 'string' ? { detail: item['detail'] } : {}),
        ...(typeof item['header'] === 'string' ? { header: item['header'] } : {}),
        ...(item['multiSelect'] === true ? { multiSelect: true } : {}),
        ...(Array.isArray(options) ? { options } : {}),
      };
    });
    if (parsed.some((item) => item === undefined)) return undefined;
    userQuestionRequest = {
      sessionId: request['sessionId'],
      ...(typeof request['callId'] === 'string' ? { callId: request['callId'] } : {}),
      questions: parsed as NonNullable<ChannelMessage['userQuestionRequest']>['questions'],
    };
  }
  let sessionFailure: ChannelMessage['sessionFailure'];
  if (record['sessionFailure'] !== undefined) {
    const failure = asRecord(record['sessionFailure']);
    if (
      failure === undefined ||
      author.kind !== 'bot' ||
      (failure['role'] !== 'orchestrator' && failure['role'] !== 'assignment') ||
      typeof failure['sessionId'] !== 'string' ||
      typeof failure['detail'] !== 'string' ||
      (failure['code'] !== undefined && typeof failure['code'] !== 'string') ||
      (failure['status'] !== undefined && typeof failure['status'] !== 'number') ||
      (failure['context'] !== undefined && typeof failure['context'] !== 'string')
    )
      return undefined;
    sessionFailure = {
      role: failure['role'],
      sessionId: failure['sessionId'],
      detail: failure['detail'],
      ...(typeof failure['requestMessageId'] === 'string'
        ? { requestMessageId: failure['requestMessageId'] }
        : {}),
      ...(typeof failure['code'] === 'string' ? { code: failure['code'] } : {}),
      ...(typeof failure['status'] === 'number' ? { status: failure['status'] } : {}),
      ...(typeof failure['context'] === 'string' ? { context: failure['context'] } : {}),
    };
    const progress = parseFailureProgress(failure['progress']);
    if (progress !== undefined) sessionFailure.progress = progress;
    const autoContinue = parseFailureAutoContinue(failure['autoContinue']);
    if (autoContinue !== undefined) sessionFailure.autoContinue = autoContinue;
  }
  let memberDeparture: ChannelMessage['memberDeparture'];
  let turnStop: ChannelMessage['turnStop'];
  let modelSwitch: ChannelMessage['modelSwitch'];
  let toolAutoApproval: ChannelMessage['toolAutoApproval'];
  let toolAutoApprovalPause: ChannelMessage['toolAutoApprovalPause'];
  let voiceCallRecord: ChannelMessage['voiceCallRecord'];
  if (record['voiceCallRecord'] !== undefined) {
    if (author.kind !== 'system' || !isChannelVoiceCallRecord(record['voiceCallRecord']))
      return undefined;
    voiceCallRecord = record['voiceCallRecord'];
  } else if (record['toolAutoApprovalPause'] !== undefined) {
    const pause = asRecord(record['toolAutoApprovalPause']);
    if (
      pause === undefined ||
      author.kind !== 'system' ||
      ['botSlug', 'sessionId', 'template'].some(
        (key) => typeof pause[key] !== 'string' || (pause[key] as string).length === 0,
      ) ||
      (pause['state'] !== 'paused' && pause['state'] !== 'resumed') ||
      (pause['reason'] !== undefined &&
        pause['reason'] !== 'consecutive' &&
        pause['reason'] !== 'session')
    )
      return undefined;
    toolAutoApprovalPause = {
      botSlug: pause['botSlug'] as string,
      sessionId: pause['sessionId'] as string,
      template: pause['template'] as string,
      state: pause['state'],
      ...(pause['reason'] === undefined ? {} : { reason: pause['reason'] }),
    };
  } else if (record['toolAutoApproval'] !== undefined) {
    const auto = asRecord(record['toolAutoApproval']);
    if (
      auto === undefined ||
      author.kind !== 'system' ||
      ['botSlug', 'sessionId', 'callId', 'toolName', 'template', 'reason'].some(
        (key) => typeof auto[key] !== 'string' || (auto[key] as string).length === 0,
      ) ||
      typeof auto['input'] !== 'string' ||
      (auto['outcome'] !== 'allowed' &&
        auto['outcome'] !== 'rejected' &&
        auto['outcome'] !== 'ask-human')
    )
      return undefined;
    toolAutoApproval = {
      botSlug: auto['botSlug'] as string,
      sessionId: auto['sessionId'] as string,
      callId: auto['callId'] as string,
      toolName: auto['toolName'] as string,
      input: auto['input'],
      template: auto['template'] as string,
      ...(typeof auto['templateVersion'] === 'string'
        ? { templateVersion: auto['templateVersion'] }
        : {}),
      outcome: auto['outcome'],
      reason: auto['reason'] as string,
    };
  } else if (record['memberDeparture'] !== undefined) {
    const departure = asRecord(record['memberDeparture']);
    if (
      departure === undefined ||
      author.kind !== 'system' ||
      (departure['memberKind'] !== 'bot' && departure['memberKind'] !== 'human') ||
      typeof departure['memberId'] !== 'string' ||
      departure['memberId'].length === 0 ||
      typeof departure['displayName'] !== 'string' ||
      departure['displayName'].length === 0 ||
      (departure['departureType'] !== undefined &&
        departure['departureType'] !== 'left' &&
        departure['departureType'] !== 'removed')
    )
      return undefined;
    memberDeparture = {
      memberKind: departure['memberKind'],
      memberId: departure['memberId'],
      displayName: departure['displayName'],
      departureType: departure['departureType'] === 'removed' ? 'removed' : 'left',
    };
  } else if (record['memoryCommit'] !== undefined) {
    if (author.kind !== 'system') return undefined;
  } else if (record['modelSwitch'] !== undefined) {
    if (author.kind !== 'system' || !isChannelModelSwitch(record['modelSwitch'])) return undefined;
    modelSwitch = record['modelSwitch'];
  } else if (record['turnStop'] !== undefined) {
    const stop = asRecord(record['turnStop']);
    if (
      stop === undefined ||
      author.kind !== 'system' ||
      typeof stop['botName'] !== 'string' ||
      typeof stop['humanName'] !== 'string'
    )
      return undefined;
    const target = asRecord(stop['target']);
    turnStop = {
      botName: stop['botName'],
      humanName: stop['humanName'],
      ...(target?.['scope'] === 'bot'
        ? { target: { scope: 'bot' as const } }
        : target?.['scope'] === 'session' &&
            (target['role'] === 'orchestrator' || target['role'] === 'assignment')
          ? {
              target: {
                scope: 'session' as const,
                role: target['role'],
                ...(typeof target['title'] === 'string' && target['title'] !== ''
                  ? { title: target['title'] }
                  : {}),
              },
            }
          : {}),
      ...(stop['held'] === true ? { held: true } : {}),
      ...(stop['cause'] === 'failures' ||
      stop['cause'] === 'human-stop' ||
      stop['cause'] === 'quota'
        ? { cause: stop['cause'] }
        : {}),
      ...(typeof stop['failures'] === 'number' ? { failures: stop['failures'] } : {}),
      ...(isChannelTurnStopRests(stop['rests']) ? { rests: stop['rests'] } : {}),
      ...(isChannelTurnStopEngine(stop['engine']) ? { engine: stop['engine'] } : {}),
      ...(stop['routingGroup'] === true ? { routingGroup: true as const } : {}),
      ...(typeof stop['botSlug'] === 'string' && stop['botSlug'] !== ''
        ? { botSlug: stop['botSlug'] }
        : {}),
    };
  } else if (author.kind === 'system' && asRecord(record['onboardingWelcome'])?.['version'] !== 1) {
    return undefined;
  }
  let memoryCommit: ChannelMessage['memoryCommit'];
  if (record['memoryCommit'] !== undefined) {
    const commit = asRecord(record['memoryCommit']);
    const count = (value: unknown): number | null | undefined =>
      value === null
        ? null
        : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
          ? value
          : undefined;
    const files = Array.isArray(commit?.['files'])
      ? commit['files'].flatMap((item: unknown) => {
          const file = asRecord(item);
          const added = count(file?.['added']);
          const deleted = count(file?.['deleted']);
          return file !== undefined &&
            typeof file['path'] === 'string' &&
            added !== undefined &&
            deleted !== undefined
            ? [{ path: file['path'], added, deleted }]
            : [];
        })
      : undefined;
    if (
      commit === undefined ||
      typeof commit['botSlug'] !== 'string' ||
      typeof commit['sha'] !== 'string' ||
      !/^[0-9a-f]{40}$/u.test(commit['sha']) ||
      typeof commit['subject'] !== 'string' ||
      typeof commit['authorName'] !== 'string' ||
      typeof commit['authoredAt'] !== 'string' ||
      files === undefined ||
      count(commit['moreFiles']) == null
    )
      return undefined;
    memoryCommit = {
      botSlug: commit['botSlug'],
      sha: commit['sha'],
      subject: commit['subject'],
      authorName: commit['authorName'],
      authoredAt: commit['authoredAt'],
      files,
      moreFiles: commit['moreFiles'] as number,
    };
  }
  let botDmAction: ChannelMessage['botDmAction'];
  if (record['botDmAction'] !== undefined) {
    const action = asRecord(record['botDmAction']);
    if (
      action === undefined ||
      author.kind !== 'bot' ||
      typeof action['channelId'] !== 'string' ||
      typeof action['messageId'] !== 'string' ||
      typeof action['recipientBotSlug'] !== 'string'
    )
      return undefined;
    botDmAction = {
      channelId: action['channelId'],
      messageId: action['messageId'],
      recipientBotSlug: action['recipientBotSlug'],
    };
  }
  let botCreateAction: ChannelMessage['botCreateAction'];
  if (record['botCreateAction'] !== undefined) {
    const action = asRecord(record['botCreateAction']);
    if (
      action === undefined ||
      author.kind !== 'bot' ||
      typeof action['botSlug'] !== 'string' ||
      typeof action['displayName'] !== 'string'
    )
      return undefined;
    botCreateAction = {
      botSlug: action['botSlug'],
      displayName: action['displayName'],
    };
  }
  let botChannelPost: ChannelMessage['botChannelPost'];
  if (record['botChannelPost'] !== undefined) {
    const post = asRecord(record['botChannelPost']);
    if (
      post === undefined ||
      author.kind !== 'bot' ||
      typeof post['channelId'] !== 'string' ||
      typeof post['messageId'] !== 'string'
    )
      return undefined;
    botChannelPost = {
      channelId: post['channelId'],
      messageId: post['messageId'],
    };
  }
  const botChannelPostPreview =
    typeof record['botChannelPostPreview'] === 'string' || record['botChannelPostPreview'] === null
      ? (record['botChannelPostPreview'] as string | null)
      : undefined;
  const noticeOriginChannel = asRecord(record['noticeOrigin'])?.['channelId'];
  const rawAttachments = record['attachments'];
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments.map(parseChannelAttachment)
    : undefined;
  if (
    rawAttachments !== undefined &&
    (attachments === undefined ||
      attachments.length > 10 ||
      attachments.some((entry) => entry === undefined))
  )
    return undefined;
  let bridgeOrigin: ChannelMessage['bridgeOrigin'];
  if (record['bridgeOrigin'] !== undefined) {
    const origin = asRecord(record['bridgeOrigin']);
    if (
      (author.kind !== 'bridged' && author.kind !== 'bot') ||
      !origin ||
      ![
        'sourceEventId',
        'platform',
        'conversationId',
        'conversationName',
        'messageId',
        'senderId',
      ].every((key) => typeof origin[key] === 'string' && origin[key].length > 0) ||
      ['accountRef', 'accountName'].some(
        (key) =>
          origin[key] !== undefined && (typeof origin[key] !== 'string' || !origin[key].trim()),
      ) ||
      (origin['threadId'] !== undefined &&
        (typeof origin['threadId'] !== 'string' || origin['threadId'].length === 0))
    )
      return undefined;
    bridgeOrigin = origin as NonNullable<ChannelMessage['bridgeOrigin']>;
  }
  let bridgeMedia: ChannelMessage['bridgeMedia'];
  if (record['bridgeMedia'] !== undefined) {
    const media = asRecord(record['bridgeMedia']);
    if (
      !bridgeOrigin ||
      !media ||
      Object.keys(media).some((key) => !['items', 'parts', 'voice', 'video'].includes(key)) ||
      !Array.isArray(media['items']) ||
      media['items'].length > 32
    )
      return;
    if (media['voice'] !== undefined) {
      const voice = asRecord(media['voice']);
      if (
        (bridgeOrigin.platform !== 'qq' && bridgeOrigin.platform !== 'feishu') ||
        !voice ||
        Object.keys(voice).some((key) => !['transcript', 'durationMs'].includes(key)) ||
        (voice['transcript'] !== 'platform' && voice['transcript'] !== 'unavailable') ||
        (voice['durationMs'] !== undefined &&
          (typeof voice['durationMs'] !== 'number' ||
            !Number.isSafeInteger(voice['durationMs']) ||
            voice['durationMs'] < 0))
      )
        return;
    }
    const ids = new Set<string>();
    for (const raw of media['items']) {
      const item = asRecord(raw);
      if (
        !item ||
        (item['kind'] === 'audio' && !media['voice']) ||
        (item['kind'] === 'video' && !media['video']) ||
        !['image', 'file', 'audio', 'video'].includes(String(item['kind'])) ||
        typeof item['id'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(item['id']) ||
        typeof item['name'] !== 'string' ||
        ids.has(item['id']) ||
        (item['sizeBytes'] !== undefined &&
          (typeof item['sizeBytes'] !== 'number' ||
            !Number.isSafeInteger(item['sizeBytes']) ||
            item['sizeBytes'] < 0)) ||
        Object.keys(item).some((key) => !['id', 'kind', 'name', 'sizeBytes'].includes(key))
      )
        return;
      ids.add(item['id']);
    }
    if (media['video'] !== undefined) {
      const video = asRecord(media['video']);
      if (
        bridgeOrigin.platform !== 'feishu' ||
        !video ||
        media['voice'] ||
        media['parts'] ||
        Object.keys(video).some(
          (key) => !['attachmentId', 'durationMs', 'posterAttachmentId'].includes(key),
        ) ||
        (video['durationMs'] !== undefined &&
          (typeof video['durationMs'] !== 'number' ||
            !Number.isSafeInteger(video['durationMs']) ||
            video['durationMs'] < 0)) ||
        media['items'].length !== (video['posterAttachmentId'] === undefined ? 1 : 2) ||
        !media['items'].some((raw) => {
          const item = asRecord(raw);
          return (
            item !== undefined && item['id'] === video['attachmentId'] && item['kind'] === 'video'
          );
        }) ||
        (video['posterAttachmentId'] !== undefined &&
          !media['items'].some((raw) => {
            const item = asRecord(raw);
            return (
              item !== undefined &&
              item['id'] === video['posterAttachmentId'] &&
              item['kind'] === 'image'
            );
          }))
      )
        return;
    }
    if (media['parts'] !== undefined) {
      if (!Array.isArray(media['parts']) || media['parts'].length > 256) return;
      for (const raw of media['parts']) {
        const part = asRecord(raw);
        if (
          !part ||
          Object.keys(part).some(
            (key) => !(part['kind'] === 'text' ? ['kind', 'text'] : ['kind', 'id']).includes(key),
          ) ||
          (part['kind'] === 'text'
            ? typeof part['text'] !== 'string' || part['text'].length > 16000
            : part['kind'] !== 'attachment' ||
              typeof part['id'] !== 'string' ||
              !ids.has(part['id']))
        )
          return;
      }
    }
    bridgeMedia = media as NonNullable<ChannelMessage['bridgeMedia']>;
  }
  const format = record['format'];
  if (format !== undefined && format !== 'markdown' && format !== 'text') return undefined;
  const replyTo = record['replyTo'];
  if (replyTo !== undefined && (typeof replyTo !== 'string' || replyTo.length === 0))
    return undefined;
  let toolApprovalDecision: ChannelMessage['toolApprovalDecision'];
  if (record['toolApprovalDecision'] !== undefined) {
    const decision = asRecord(record['toolApprovalDecision']);
    if (
      decision === undefined ||
      author.kind !== 'human' ||
      typeof decision['requestMessageId'] !== 'string' ||
      (decision['outcome'] !== 'allowed-once' &&
        decision['outcome'] !== 'allowed-always-tool' &&
        decision['outcome'] !== 'allowed-always-exact' &&
        decision['outcome'] !== 'allowed-always-all' &&
        decision['outcome'] !== 'rejected') ||
      replyTo !== decision['requestMessageId']
    )
      return undefined;
    const actor =
      decision['actor'] === undefined ? undefined : parseToolApprovalActor(decision['actor']);
    if (decision['actor'] !== undefined && !actor) return undefined;
    toolApprovalDecision = {
      requestMessageId: decision['requestMessageId'],
      outcome: decision['outcome'],
      ...(actor ? { actor } : {}),
    };
  }
  let userQuestionResolution: ChannelMessage['userQuestionResolution'];
  if (record['userQuestionResolution'] !== undefined) {
    const resolution = asRecord(record['userQuestionResolution']);
    if (
      resolution === undefined ||
      typeof resolution['requestMessageId'] !== 'string' ||
      replyTo !== resolution['requestMessageId'] ||
      (resolution['state'] !== 'answered' && resolution['state'] !== 'cancelled')
    )
      return undefined;
    if (resolution['state'] === 'answered') {
      if (author.kind !== 'human' || !Array.isArray(resolution['answers'])) return undefined;
      const answers = resolution['answers'] as unknown[];
      if (
        !answers.every((value) => {
          const item = asRecord(value);
          return (
            item !== undefined &&
            typeof item['id'] === 'string' &&
            Array.isArray(item['selected']) &&
            item['selected'].every((label) => typeof label === 'string') &&
            (item['custom'] === undefined || typeof item['custom'] === 'string')
          );
        })
      )
        return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'answered',
        answers: answers as UserQuestionAnswerItem[],
      };
    } else {
      if (author.kind !== 'bot') return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'cancelled',
      };
    }
  }
  const quotes = parseMessageQuotes(record['quotes']);
  if (quotes === false) return undefined;
  const rawPreview = record['replyToPreview'];
  let replyToPreview: ChannelMessage['replyToPreview'];
  if (rawPreview === null) {
    replyToPreview = null;
  } else if (rawPreview !== undefined) {
    const preview = asRecord(rawPreview);
    if (preview === undefined || typeof preview['body'] !== 'string') return undefined;
    const previewAuthor = parseAuthor(preview['author']);
    if (previewAuthor === undefined) return undefined;
    const media = preview['media'];
    replyToPreview = {
      author: previewAuthor,
      body: preview['body'],
      ...(isChannelReplyPreviewMedia(media) ? { media } : {}),
    };
  }
  const mentions = record['mentions'];
  if (
    mentions !== undefined &&
    (!Array.isArray(mentions) ||
      mentions.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const channelRefs = record['channelRefs'];
  const humanMentions = record['humanMentions'];
  if (
    humanMentions !== undefined &&
    (!Array.isArray(humanMentions) ||
      author.kind !== 'bot' ||
      humanMentions.some((entry) => {
        const mention = asRecord(entry);
        return (
          mention === undefined ||
          typeof mention['humanId'] !== 'string' ||
          mention['humanId'].length === 0 ||
          typeof mention['label'] !== 'string' ||
          mention['label'].length === 0 ||
          typeof mention['start'] !== 'number' ||
          typeof mention['end'] !== 'number' ||
          !Number.isSafeInteger(mention['start']) ||
          !Number.isSafeInteger(mention['end']) ||
          mention['start'] < 0 ||
          mention['end'] <= mention['start'] ||
          body.slice(mention['start'], mention['end']) !== '@' + mention['label']
        );
      }))
  )
    return undefined;
  if (
    channelRefs !== undefined &&
    (!Array.isArray(channelRefs) ||
      channelRefs.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['channelId'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const skillInvocations = parseSkillInvocations(record['skillInvocations'], body);
  const channelRevision = record['channelRevision'];
  if (
    channelRevision !== undefined &&
    (typeof channelRevision !== 'number' ||
      !Number.isSafeInteger(channelRevision) ||
      channelRevision < 1)
  )
    return undefined;
  const humanReceipts = record['humanReceipts'];
  if (
    humanReceipts !== undefined &&
    (!Array.isArray(humanReceipts) ||
      humanReceipts.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['humanId'] !== 'string' ||
          typeof item['displayName'] !== 'string' ||
          (item['state'] !== 'unread' && item['state'] !== 'read')
        );
      }))
  )
    return undefined;
  const reactions =
    record['reactions'] === undefined ? undefined : parseReactions(record['reactions']);
  if (record['reactions'] !== undefined && reactions === undefined) return undefined;
  const deliveries = record['deliveries'];
  if (
    deliveries !== undefined &&
    (!Array.isArray(deliveries) ||
      deliveries.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          ![
            'pending',
            'observed',
            'running',
            'retryable',
            'needs-repair',
            'handled',
            'ignored',
          ].includes(String(item['state']))
        );
      }))
  )
    return undefined;
  return {
    id,
    at,
    author,
    body,
    ...(asRecord(record['onboardingWelcome'])?.['version'] === 1 && author.kind === 'system'
      ? {
          onboardingWelcome: {
            version: 1 as const,
            ...(asRecord(record['onboardingWelcome'])?.['kind'] === 'tob'
              ? { kind: 'tob' as const }
              : {}),
          },
        }
      : {}),
    ...(body === '' && asRecord(record['contentPurge'])?.['actor'] === 'local-human'
      ? { contentPurged: true as const }
      : {}),
    ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
    ...(genui === undefined ? {} : { genui }),
    ...(record['genui'] !== undefined && genui === undefined && author.kind === 'bot'
      ? { genuiUnavailable: true as const }
      : {}),
    ...(genuiReply === undefined ? {} : { genuiReply }),
    ...(mentions === undefined
      ? {}
      : { mentions: mentions as NonNullable<ChannelMessage['mentions']> }),
    ...(humanMentions === undefined
      ? {}
      : {
          humanMentions: humanMentions as NonNullable<ChannelMessage['humanMentions']>,
        }),
    ...(channelRefs === undefined
      ? {}
      : {
          channelRefs: channelRefs as NonNullable<ChannelMessage['channelRefs']>,
        }),
    ...(skillInvocations.length === 0 || author.kind !== 'human' ? {} : { skillInvocations }),
    ...(deliveries === undefined
      ? {}
      : {
          deliveries: deliveries as NonNullable<ChannelMessage['deliveries']>,
        }),
    ...(humanReceipts === undefined
      ? {}
      : {
          humanReceipts: humanReceipts as NonNullable<ChannelMessage['humanReceipts']>,
        }),
    ...(channelRevision === undefined ? {} : { channelRevision }),
    ...(reactions === undefined || reactions.length === 0 ? {} : { reactions }),
    ...(grantRequest === true ? { grantRequest: true as const } : {}),
    ...(grantRequest === true && record['grantRequestResolved'] === true
      ? { grantRequestResolved: true }
      : {}),
    ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
    ...(assignmentReply === undefined ? {} : { assignmentReply }),
    ...(sessionLinks.length === 0 ? {} : { sessionLinks }),
    ...(botDmAction === undefined ? {} : { botDmAction }),
    ...(botCreateAction === undefined ? {} : { botCreateAction }),
    ...(botChannelPost === undefined ? {} : { botChannelPost }),
    ...(botChannelPost === undefined || botChannelPostPreview === undefined
      ? {}
      : { botChannelPostPreview }),
    ...(typeof noticeOriginChannel === 'string'
      ? { noticeOrigin: { channelId: noticeOriginChannel } }
      : {}),
    ...(memoryCommit === undefined ? {} : { memoryCommit }),
    ...(memberDeparture === undefined ? {} : { memberDeparture }),
    ...(turnStop === undefined ? {} : { turnStop }),
    ...(modelSwitch === undefined ? {} : { modelSwitch }),
    ...(voiceCallRecord === undefined ? {} : { voiceCallRecord }),
    ...(toolAutoApproval === undefined ? {} : { toolAutoApproval }),
    ...(toolAutoApprovalPause === undefined ? {} : { toolAutoApprovalPause }),
    ...(toolApprovalRequest === undefined ? {} : { toolApprovalRequest }),
    ...(approval === undefined ? {} : { approval }),
    ...(sessionFailure === undefined ? {} : { sessionFailure }),
    ...(toolApprovalDecision === undefined ? {} : { toolApprovalDecision }),
    ...(record['privateInputRequest'] === undefined ||
    isMaskedRequest(record['privateInputRequest'])
      ? {}
      : {
          privateInputRequest: parsePrivateInputCard(record['privateInputRequest']),
        }),
    ...(userQuestionRequest === undefined ? {} : { userQuestionRequest }),
    ...(userQuestionResolution === undefined ? {} : { userQuestionResolution }),
    ...(isTakeoverRequestCard(record['takeoverRequest']) && author.kind === 'bot'
      ? { takeoverRequest: record['takeoverRequest'] }
      : {}),
    ...(isTakeoverResolution(record['takeoverResolution'])
      ? { takeoverResolution: record['takeoverResolution'] }
      : {}),
    ...(attachments === undefined ? {} : { attachments: attachments as ChannelAttachmentRef[] }),
    ...(author.kind === 'bot' && parseMessageVoice(record['voice']) !== undefined
      ? { voice: parseMessageVoice(record['voice'])! }
      : {}),
    ...(Array.isArray(record['clearedAttachments']) &&
    record['clearedAttachments'].length <= 10 &&
    record['clearedAttachments'].every(isChannelClearedAttachment)
      ? { clearedAttachments: record['clearedAttachments'] }
      : {}),
    ...(format === undefined ? {} : { format }),
    ...(bridgeOrigin === undefined ? {} : { bridgeOrigin }),
    ...(bridgeMedia === undefined ? {} : { bridgeMedia }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(replyToPreview === undefined ? {} : { replyToPreview }),
    ...(quotes === undefined ? {} : { quotes }),
    ...(perf === undefined ? {} : { perf }),
  };
}

export function parseChannelMessages(value: unknown): ChannelMessage[] {
  const messages = asRecord(value)?.['messages'];
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((entry) => {
    const message = parseChannelMessage(entry);
    return message === undefined ? [] : [message];
  });
}
