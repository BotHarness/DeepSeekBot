import { isSessionTurnModelSwitch, isTurnTargetPath } from '@botharness/host-protocol/turn-target';
import { isChannelQuoteList } from './quotes.js';
import { isChannelMessageVoice } from './voice.js';
import { parseToolApprovalActor } from '../workspaces/tool-approval-actor.js';
import {
  isChannelTurnStopEngine,
  isChannelTurnStopRests,
  isChannelTurnStopTarget,
} from './turn-stop.js';
import { isChannelModelSwitch } from './model-switch.js';
import { isChannelVoiceCallRecord } from './voice-call-record.js';
import { isChannelAttachmentRef, isChannelClearedAttachment } from '../attachments/ref.js';
import { privateRequestSchema } from '../credentials/contracts.js';
import { isTakeoverRequestCard, isTakeoverResolution } from '../takeover/contracts.js';
import { PRIVATE_REFERENCE } from '../credentials/references.js';
import { isValidChannelId } from './channel-record.js';
import {
  isChannelMessageAuthor,
  isChannelVoiceCallMessage,
  isSkillInvocationToken,
  type ChannelMemoryCommit,
  type ChannelMessage,
  type ChannelMessageAuthor,
} from './channel-message-types.js';

function isMemoryCommit(value: unknown): value is ChannelMemoryCommit {
  if (typeof value !== 'object' || value === null) return false;
  const commit = value as Record<string, unknown>;
  const count = (item: unknown): boolean =>
    item === null || (Number.isSafeInteger(item) && (item as number) >= 0);
  return (
    typeof commit['botSlug'] === 'string' &&
    commit['botSlug'].length > 0 &&
    typeof commit['sha'] === 'string' &&
    /^[0-9a-f]{40}$/u.test(commit['sha']) &&
    typeof commit['subject'] === 'string' &&
    typeof commit['authorName'] === 'string' &&
    typeof commit['authoredAt'] === 'string' &&
    Array.isArray(commit['files']) &&
    commit['files'].length <= 20 &&
    commit['files'].every(
      (file: unknown) =>
        typeof file === 'object' &&
        file !== null &&
        typeof (file as Record<string, unknown>)['path'] === 'string' &&
        count((file as Record<string, unknown>)['added']) &&
        count((file as Record<string, unknown>)['deleted']),
    ) &&
    Number.isSafeInteger(commit['moreFiles']) &&
    (commit['moreFiles'] as number) >= 0
  );
}

function validFailureProgress(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const progress = value as Record<string, unknown>;
  return (
    typeof progress['completedSteps'] === 'number' &&
    Number.isInteger(progress['completedSteps']) &&
    progress['completedSteps'] >= 0 &&
    (progress['lastTool'] === undefined || typeof progress['lastTool'] === 'string') &&
    (progress['unknownTools'] === undefined ||
      (Array.isArray(progress['unknownTools']) &&
        progress['unknownTools'].every((name) => typeof name === 'string')))
  );
}

function validFailureAutoContinue(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const auto = value as Record<string, unknown>;
  return (
    typeof auto['attempt'] === 'number' &&
    Number.isInteger(auto['attempt']) &&
    auto['attempt'] >= 1 &&
    typeof auto['maxAttempts'] === 'number' &&
    Number.isInteger(auto['maxAttempts']) &&
    auto['maxAttempts'] >= auto['attempt'] &&
    typeof auto['at'] === 'string' &&
    Number.isFinite(Date.parse(auto['at']))
  );
}

export function isChannelMessage(value: unknown): value is ChannelMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  if (typeof message['id'] !== 'string' || message['id'].length === 0) return false;
  if (typeof message['at'] !== 'string' || message['at'].length === 0) return false;
  if (typeof message['body'] !== 'string') return false;
  if (
    message['turnModelSwitch'] !== undefined &&
    !isSessionTurnModelSwitch(message['turnModelSwitch'])
  )
    return false;
  if (message['turnTargets'] !== undefined && !isTurnTargetPath(message['turnTargets']))
    return false;
  const welcome = message['onboardingWelcome'];
  if (
    welcome !== undefined &&
    (typeof welcome !== 'object' ||
      welcome === null ||
      (welcome as { version?: unknown }).version !== 1 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system')
  )
    return false;
  const voiceCall = message['voiceCall'];
  if (
    voiceCall !== undefined &&
    (!isChannelVoiceCallMessage(voiceCall) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human')
  )
    return false;
  const cliRequest = message['tobCliRequestId'];
  if (
    cliRequest !== undefined &&
    (typeof cliRequest !== 'string' ||
      !/^[a-f0-9-]{36}$/u.test(cliRequest) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human')
  )
    return false;
  const switchTarget = message['memorySwitchTarget'];
  if (
    switchTarget !== undefined &&
    (typeof switchTarget !== 'string' ||
      switchTarget.length === 0 ||
      switchTarget.length > 255 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human')
  )
    return false;
  if (
    message['grantRequest'] !== undefined &&
    (message['grantRequest'] !== true ||
      !isChannelMessageAuthor(message['author']) ||
      (message['author'] as ChannelMessageAuthor).kind !== 'bot')
  )
    return false;
  if (
    message['grantRequestOwner'] !== undefined &&
    (message['grantRequest'] !== true ||
      typeof message['grantRequestOwner'] !== 'string' ||
      !message['grantRequestOwner'])
  )
    return false;
  const grantResolution = message['grantRequestResolution'];
  const assignmentReply = message['assignmentReply'];
  if (assignmentReply !== undefined) {
    if (
      typeof assignmentReply !== 'object' ||
      assignmentReply === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const target = assignmentReply as Record<string, unknown>;
    if (
      typeof target['sessionId'] !== 'string' ||
      target['sessionId'].length === 0 ||
      target['sessionId'].length > 150 ||
      typeof target['sourceEventId'] !== 'string' ||
      target['sourceEventId'].length === 0 ||
      target['sourceEventId'].length > 150
    )
      return false;
  }
  if (grantResolution !== undefined) {
    if (
      typeof grantResolution !== 'object' ||
      grantResolution === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const resolution = grantResolution as Record<string, unknown>;
    if (
      typeof resolution['requestMessageId'] !== 'string' ||
      resolution['requestMessageId'].length === 0 ||
      typeof resolution['grantId'] !== 'string' ||
      resolution['grantId'].length === 0 ||
      message['replyTo'] !== resolution['requestMessageId']
    )
      return false;
  }
  const toolRequest = message['toolApprovalRequest'];
  if (toolRequest !== undefined) {
    if (
      typeof toolRequest !== 'object' ||
      toolRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const request = toolRequest as Record<string, unknown>;
    if (
      typeof request['sessionId'] !== 'string' ||
      typeof request['callId'] !== 'string' ||
      typeof request['toolName'] !== 'string' ||
      typeof request['cwd'] !== 'string' ||
      typeof request['input'] !== 'string' ||
      (request['role'] !== 'orchestrator' && request['role'] !== 'assignment')
    )
      return false;
  }
  const failure = message['sessionFailure'];
  if (failure !== undefined) {
    if (
      typeof failure !== 'object' ||
      failure === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const notice = failure as Record<string, unknown>;
    if (
      (notice['role'] !== 'orchestrator' && notice['role'] !== 'assignment') ||
      typeof notice['sessionId'] !== 'string' ||
      notice['sessionId'].length === 0 ||
      typeof notice['detail'] !== 'string' ||
      notice['detail'].length === 0 ||
      (notice['code'] !== undefined && typeof notice['code'] !== 'string') ||
      (notice['status'] !== undefined && typeof notice['status'] !== 'number') ||
      (notice['context'] !== undefined && typeof notice['context'] !== 'string') ||
      !validFailureProgress(notice['progress']) ||
      !validFailureAutoContinue(notice['autoContinue'])
    )
      return false;
  }
  const autoOverride = message['toolAutoApprovalOverride'];
  if (autoOverride !== undefined) {
    const target = autoOverride as Record<string, unknown> | null;
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human' ||
      typeof target !== 'object' ||
      target === null ||
      ['recordMessageId', 'botSlug', 'sessionId', 'toolName'].some(
        (key) => typeof target[key] !== 'string' || target[key].length === 0,
      ) ||
      message['replyTo'] !== target['recordMessageId']
    )
      return false;
  }
  for (const key of [
    'toolApprovalRequest',
    'userQuestionRequest',
    'privateInputRequest',
    'toolApprovalDecision',
    'userQuestionResolution',
    'privateInputResolution',
  ]) {
    const decision = message[key];
    if (decision !== null && typeof decision === 'object' && 'decidedBy' in decision) {
      const decider = decision.decidedBy;
      if (
        decider === null ||
        typeof decider !== 'object' ||
        !('humanId' in decider) ||
        typeof decider.humanId !== 'string' ||
        decider.humanId.length === 0 ||
        ('displayName' in decider && typeof decider.displayName !== 'string')
      )
        return false;
    }
  }
  const toolDecision = message['toolApprovalDecision'];
  if (toolDecision !== undefined) {
    if (
      typeof toolDecision !== 'object' ||
      toolDecision === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const decision = toolDecision as Record<string, unknown>;
    if (decision['actor'] !== undefined && !parseToolApprovalActor(decision['actor'])) return false;
    if (
      typeof decision['requestMessageId'] !== 'string' ||
      (decision['outcome'] !== 'allowed-once' &&
        decision['outcome'] !== 'allowed-always-tool' &&
        decision['outcome'] !== 'allowed-always-exact' &&
        decision['outcome'] !== 'allowed-always-all' &&
        decision['outcome'] !== 'rejected') ||
      message['replyTo'] !== decision['requestMessageId']
    )
      return false;
  }
  const mentions = message['mentions'];
  if (
    mentions !== undefined &&
    (!Array.isArray(mentions) ||
      mentions.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          typeof item.botSlug !== 'string' ||
          typeof item.label !== 'string' ||
          typeof item.start !== 'number' ||
          typeof item.end !== 'number' ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start,
      ))
  )
    return false;
  const humanMentions = message['humanMentions'];
  if (
    humanMentions !== undefined &&
    (!Array.isArray(humanMentions) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot' ||
      humanMentions.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          typeof item.humanId !== 'string' ||
          item.humanId.length === 0 ||
          typeof item.label !== 'string' ||
          item.label.length === 0 ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start ||
          (message['body'] as string).slice(item.start, item.end) !== '@' + item.label,
      ))
  )
    return false;
  const channelRefs = message['channelRefs'];
  if (
    channelRefs !== undefined &&
    (!Array.isArray(channelRefs) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human' ||
      channelRefs.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          !isValidChannelId(item.channelId) ||
          typeof item.label !== 'string' ||
          item.label.length === 0 ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start ||
          (message['body'] as string).slice(item.start, item.end) !== '#' + item.label,
      ))
  )
    return false;
  const skillInvocations = message['skillInvocations'];
  if (
    skillInvocations !== undefined &&
    (!Array.isArray(skillInvocations) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human' ||
      skillInvocations.some(
        (item) =>
          !isSkillInvocationToken(item, message['body'] as string) ||
          typeof (item as { content?: unknown }).content !== 'string' ||
          !['string', 'undefined'].includes(typeof (item as { path?: unknown }).path),
      ))
  )
    return false;
  const questionRequest = message['userQuestionRequest'];
  if (questionRequest !== undefined) {
    if (
      typeof questionRequest !== 'object' ||
      questionRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const request = questionRequest as Record<string, unknown>;
    if (
      typeof request['sessionId'] !== 'string' ||
      request['sessionId'].length === 0 ||
      (request['callId'] !== undefined &&
        (typeof request['callId'] !== 'string' || request['callId'].length === 0)) ||
      !Array.isArray(request['questions']) ||
      request['questions'].length === 0 ||
      !request['questions'].every((value) => {
        if (typeof value !== 'object' || value === null) return false;
        const item = value as Record<string, unknown>;
        return (
          typeof item['id'] === 'string' &&
          typeof item['question'] === 'string' &&
          (item['detail'] === undefined || typeof item['detail'] === 'string') &&
          (item['header'] === undefined || typeof item['header'] === 'string') &&
          (item['multiSelect'] === undefined || typeof item['multiSelect'] === 'boolean') &&
          (item['options'] === undefined ||
            (Array.isArray(item['options']) &&
              item['options'].every((option) => {
                if (typeof option !== 'object' || option === null) return false;
                const row = option as Record<string, unknown>;
                return (
                  typeof row['label'] === 'string' &&
                  (row['description'] === undefined || typeof row['description'] === 'string')
                );
              })))
        );
      })
    )
      return false;
  }
  const questionResolution = message['userQuestionResolution'];
  if (questionResolution !== undefined) {
    if (typeof questionResolution !== 'object' || questionResolution === null) return false;
    const resolution = questionResolution as Record<string, unknown>;
    if (
      resolution['actor'] !== undefined &&
      (resolution['state'] !== 'answered' || !parseToolApprovalActor(resolution['actor']))
    )
      return false;
    if (
      typeof resolution['requestMessageId'] !== 'string' ||
      message['replyTo'] !== resolution['requestMessageId'] ||
      (resolution['state'] !== 'answered' && resolution['state'] !== 'cancelled') ||
      (resolution['state'] === 'answered' &&
        (((message['author'] as ChannelMessageAuthor)?.kind !== 'human' &&
          ((message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
            resolution['decidedBy'] !== undefined)) ||
          !Array.isArray(resolution['answers']))) ||
      (resolution['state'] === 'cancelled' &&
        (message['author'] as ChannelMessageAuthor)?.kind !== 'bot')
    )
      return false;
  }
  const memberDeparture = message['memberDeparture'];
  if (memberDeparture !== undefined) {
    if (typeof memberDeparture !== 'object' || memberDeparture === null) return false;
    const departure = memberDeparture as Record<string, unknown>;
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      (departure['memberKind'] !== 'bot' && departure['memberKind'] !== 'human') ||
      typeof departure['memberId'] !== 'string' ||
      departure['memberId'].length === 0 ||
      typeof departure['displayName'] !== 'string' ||
      departure['displayName'].length === 0 ||
      (departure['departureType'] !== undefined &&
        departure['departureType'] !== 'left' &&
        departure['departureType'] !== 'removed')
    )
      return false;
  } else if (message['memoryCommit'] !== undefined) {
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      !isMemoryCommit(message['memoryCommit'])
    )
      return false;
  } else if (message['turnStop'] !== undefined) {
    const stop = message['turnStop'] as Record<string, unknown> | null;
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      typeof stop !== 'object' ||
      stop === null ||
      ['botSlug', 'botName', 'humanName', 'sessionId'].some(
        (key) => typeof stop[key] !== 'string' || stop[key].length === 0,
      ) ||
      (stop['held'] !== undefined && stop['held'] !== true) ||
      (stop['cause'] !== undefined &&
        stop['cause'] !== 'human-stop' &&
        stop['cause'] !== 'failures' &&
        stop['cause'] !== 'quota') ||
      (stop['rests'] !== undefined && !isChannelTurnStopRests(stop['rests'])) ||
      (stop['engine'] !== undefined && !isChannelTurnStopEngine(stop['engine'])) ||
      (stop['routingGroup'] !== undefined && stop['routingGroup'] !== true) ||
      (stop['failures'] !== undefined &&
        (typeof stop['failures'] !== 'number' || !Number.isInteger(stop['failures']))) ||
      (stop['target'] !== undefined && !isChannelTurnStopTarget(stop['target']))
    )
      return false;
  } else if (message['modelSwitch'] !== undefined) {
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      !isChannelModelSwitch(message['modelSwitch'])
    )
      return false;
  } else if (message['voiceCallRecord'] !== undefined) {
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      !isChannelVoiceCallRecord(message['voiceCallRecord'])
    )
      return false;
  } else if (message['toolAutoApproval'] !== undefined) {
    const record = message['toolAutoApproval'] as Record<string, unknown> | null;
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      typeof record !== 'object' ||
      record === null ||
      ['botSlug', 'sessionId', 'callId', 'toolName', 'template', 'reason'].some(
        (key) => typeof record[key] !== 'string' || record[key].length === 0,
      ) ||
      typeof record['input'] !== 'string' ||
      (record['outcome'] !== 'allowed' &&
        record['outcome'] !== 'rejected' &&
        record['outcome'] !== 'ask-human')
    )
      return false;
  } else if (message['toolAutoApprovalPause'] !== undefined) {
    const pause = message['toolAutoApprovalPause'] as Record<string, unknown> | null;
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      typeof pause !== 'object' ||
      pause === null ||
      ['botSlug', 'sessionId', 'template'].some(
        (key) => typeof pause[key] !== 'string' || pause[key].length === 0,
      ) ||
      (pause['state'] !== 'paused' && pause['state'] !== 'resumed') ||
      (pause['reason'] !== undefined &&
        pause['reason'] !== 'consecutive' &&
        pause['reason'] !== 'session')
    )
      return false;
  } else if (
    message['takeoverResolution'] !== undefined ||
    message['userQuestionResolution'] !== undefined
  ) {
  } else if (
    (message['author'] as ChannelMessageAuthor)?.kind === 'system' &&
    !(
      typeof message['onboardingWelcome'] === 'object' &&
      message['onboardingWelcome'] !== null &&
      (message['onboardingWelcome'] as { version?: unknown }).version === 1
    )
  ) {
    return false;
  }
  const botDmAction = message['botDmAction'];
  if (botDmAction !== undefined) {
    if (typeof botDmAction !== 'object' || botDmAction === null) return false;
    const action = botDmAction as Record<string, unknown>;
    if (
      typeof action['channelId'] !== 'string' ||
      typeof action['messageId'] !== 'string' ||
      typeof action['recipientBotSlug'] !== 'string' ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
  }
  const botCreateAction = message['botCreateAction'];
  if (botCreateAction !== undefined) {
    if (typeof botCreateAction !== 'object' || botCreateAction === null) return false;
    const action = botCreateAction as Record<string, unknown>;
    if (
      typeof action['botSlug'] !== 'string' ||
      action['botSlug'].length === 0 ||
      typeof action['displayName'] !== 'string' ||
      action['displayName'].length === 0 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
  }
  const botChannelPost = message['botChannelPost'];
  if (botChannelPost !== undefined) {
    if (typeof botChannelPost !== 'object' || botChannelPost === null) return false;
    const post = botChannelPost as Record<string, unknown>;
    if (
      typeof post['channelId'] !== 'string' ||
      typeof post['messageId'] !== 'string' ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
  }
  const botCausation = message['botCausation'];
  if (botCausation !== undefined) {
    if (typeof botCausation !== 'object' || botCausation === null) return false;
    const causal = botCausation as Record<string, unknown>;
    if (
      typeof causal['rootSourceEventId'] !== 'string' ||
      typeof causal['parentSourceEventId'] !== 'string' ||
      !Number.isSafeInteger(causal['hop']) ||
      (causal['hop'] as number) < 1 ||
      !['bot', 'remote-bot'].includes((message['author'] as ChannelMessageAuthor)?.kind)
    )
      return false;
  }
  const attachments = message['attachments'];
  if (
    attachments !== undefined &&
    (!Array.isArray(attachments) ||
      attachments.length > 10 ||
      !attachments.every(isChannelAttachmentRef))
  )
    return false;
  if (
    message['voice'] !== undefined &&
    (!isChannelMessageVoice(message['voice']) ||
      !['bot', 'remote-bot'].includes((message['author'] as ChannelMessageAuthor)?.kind))
  )
    return false;
  const cleared = message['clearedAttachments'];
  if (
    cleared !== undefined &&
    (!Array.isArray(cleared) || cleared.length > 10 || !cleared.every(isChannelClearedAttachment))
  )
    return false;
  if (!isChannelMessageAuthor(message['author'])) return false;
  if (
    message['format'] !== undefined &&
    message['format'] !== 'markdown' &&
    message['format'] !== 'text'
  )
    return false;
  if (
    message['replyTo'] !== undefined &&
    (typeof message['replyTo'] !== 'string' || message['replyTo'].length === 0)
  )
    return false;
  if (!isChannelQuoteList(message['quotes'])) return false;
  const preview = message['replyToPreview'];
  if (preview !== undefined && preview !== null) {
    if (typeof preview !== 'object') return false;
    const record = preview as Record<string, unknown>;
    if (!isChannelMessageAuthor(record['author']) || typeof record['body'] !== 'string')
      return false;
  }
  const bridgeOrigin = message['bridgeOrigin'];
  if (bridgeOrigin !== undefined) {
    if (
      typeof bridgeOrigin !== 'object' ||
      bridgeOrigin === null ||
      !['bridged', 'bot'].includes((message['author'] as ChannelMessageAuthor)?.kind)
    )
      return false;
    const origin = bridgeOrigin as Record<string, unknown>;
    for (const key of ['accountRef', 'accountName']) {
      if (origin[key] !== undefined && (typeof origin[key] !== 'string' || !origin[key].trim()))
        return false;
    }
    for (const key of [
      'sourceEventId',
      'platform',
      'conversationId',
      'conversationName',
      'messageId',
      'senderId',
    ]) {
      if (typeof origin[key] !== 'string' || origin[key].length === 0) return false;
    }
    if (
      origin['senderName'] !== undefined &&
      (typeof origin['senderName'] !== 'string' || origin['senderName'].trim().length === 0)
    )
      return false;
    const nativeMentions = origin['mentions'];
    if (
      nativeMentions !== undefined &&
      (!Array.isArray(nativeMentions) ||
        !nativeMentions.every(
          (mention) =>
            typeof mention === 'object' &&
            mention !== null &&
            typeof mention.id === 'string' &&
            mention.id.length > 0 &&
            typeof mention.key === 'string' &&
            mention.key.length > 0 &&
            (mention.name === undefined || typeof mention.name === 'string'),
        ))
    )
      return false;
    if (
      origin['threadId'] !== undefined &&
      (typeof origin['threadId'] !== 'string' || origin['threadId'].length === 0)
    )
      return false;
  }
  const privateRequest = message['privateInputRequest'];
  if (privateRequest !== undefined) {
    if (
      typeof privateRequest !== 'object' ||
      privateRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const {
      sessionId,
      expiresAt,
      replacesMessageId,
      opaque,
      decidedBy: _decidedBy,
      ...declaration
    } = privateRequest as Record<string, unknown>;
    if (
      (opaque !== undefined && typeof opaque !== 'boolean') ||
      (sessionId === undefined
        ? replacesMessageId === undefined
        : typeof sessionId !== 'string' || sessionId.length === 0) ||
      (replacesMessageId !== undefined &&
        (typeof replacesMessageId !== 'string' || !/^[0-9a-f-]{36}$/.test(replacesMessageId))) ||
      (expiresAt !== undefined &&
        (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))) ||
      !privateRequestSchema.safeParse(declaration).success
    )
      return false;
  }
  const privateResolution = message['privateInputResolution'];
  if (privateResolution !== undefined) {
    if (
      typeof privateResolution !== 'object' ||
      privateResolution === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const resolution = privateResolution as Record<string, unknown>;
    if (
      Object.keys(resolution).some(
        (key) => !['requestMessageId', 'state', 'references', 'decidedBy'].includes(key),
      ) ||
      typeof resolution.requestMessageId !== 'string' ||
      message['replyTo'] !== resolution.requestMessageId ||
      !['configured', 'cancelled', 'expired'].includes(String(resolution.state)) ||
      typeof resolution.references !== 'object' ||
      resolution.references === null ||
      Array.isArray(resolution.references) ||
      (resolution.state !== 'configured' && Object.keys(resolution.references).length > 0) ||
      !Object.values(resolution.references).every(
        (ref) => typeof ref === 'string' && PRIVATE_REFERENCE.test(ref),
      )
    )
      return false;
  }
  const takeoverRequest = message['takeoverRequest'];
  if (
    takeoverRequest !== undefined &&
    (!isTakeoverRequestCard(takeoverRequest) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot')
  )
    return false;
  const takeoverResolution = message['takeoverResolution'];
  if (takeoverResolution !== undefined) {
    if (!isTakeoverResolution(takeoverResolution)) return false;
    const author = (message['author'] as ChannelMessageAuthor)?.kind;
    const expected =
      takeoverResolution.by === 'human'
        ? 'human'
        : takeoverResolution.by === 'bot'
          ? 'bot'
          : 'system';
    if (author !== expected || message['replyTo'] !== takeoverResolution.requestMessageId)
      return false;
  }
  const external = message['external'];
  if (external !== undefined) {
    if (typeof external !== 'object' || external === null) return false;
    const record = external as Record<string, unknown>;
    if (typeof record['id'] !== 'string' || record['id'].length === 0) return false;
    if (record['thread'] !== undefined && typeof record['thread'] !== 'string') return false;
  }
  return true;
}
