import { createHash } from 'node:crypto';

export function genuiMessageSelector(messageId) {
  return `[data-message-id=${JSON.stringify(messageId)}] section[aria-label]`;
}

export function findGenuiModelFollowup(messages, trace, request) {
  if (typeof trace?.sessionId !== 'string' || trace.sessionId === 'direct') return;
  const after = Date.parse(request.after);
  if (!Number.isFinite(after)) return;
  const humanSource = request.sourceEvents?.find(
    (entry) => entry.messageId === request.humanMessageId && entry.channelId === request.channelId,
  );
  if (!humanSource?.sourceEventId) return;
  for (const message of messages) {
    if (
      message.author?.kind !== 'bot' ||
      message.author.slug !== request.slug ||
      !(Date.parse(message.at) > after) ||
      message.genui?.version !== 2 ||
      message.genui.predecessorMessageId !== request.predecessorMessageId
    )
      continue;
    const source = request.sourceEvents?.find(
      (entry) =>
        entry.messageId === message.id &&
        entry.channelId === request.channelId &&
        typeof entry.sourceEventId === 'string' &&
        entry.sourceEventId.length > 0,
    );
    if (
      !source ||
      !request.admissions?.some(
        (entry) =>
          entry.botSlug === request.slug && entry.sourceEventId === humanSource.sourceEventId,
      )
    )
      continue;
    for (const turn of trace.turns ?? []) {
      if (!(Date.parse(turn.startedAt) >= after)) continue;
      let preview;
      for (const call of turn.calls ?? []) {
        if (call.name === 'genui_preview' && call.outcome === 'ok') {
          try {
            const diagnostic = JSON.parse(call.result.split('\n')[0]);
            if (
              diagnostic.documentId === genuiVerificationDigest(message.genui) &&
              diagnostic.diagnostics?.length === 0
            )
              preview = call;
          } catch {}
        }
        if (
          preview &&
          call.name === 'bot_send_message' &&
          call.outcome === 'ok' &&
          (call.args?.channel_id === undefined || call.args.channel_id === request.channelId) &&
          (call.args?.source_event_id === undefined ||
            call.args.source_event_id === humanSource.sourceEventId)
        ) {
          let result;
          try {
            result = JSON.parse(call.result);
          } catch {
            continue;
          }
          if (
            result.status === 'committed' &&
            result.channelId === request.channelId &&
            result.messageId === message.id
          )
            return {
              message,
              sourceEventId: source.sourceEventId,
              sessionId: trace.sessionId,
              turn: turn.turn,
              previewCallId: preview.callId,
              publishCallId: call.callId,
            };
        }
      }
    }
  }
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, ordered(entry)]),
    );
  return value;
}

export function genuiVerificationDigest(document) {
  return createHash('sha256')
    .update(JSON.stringify(ordered(document)))
    .digest('hex');
}
