import { DiagnosticBundleError, type DiagnosticBundleSource } from './bundle.js';
import type { DiagnosticRedactor } from './redaction.js';

export interface FailureTurnEvidence {
  prompt: string[];
  toolCalls: Array<{ type: 'tool/call' | 'tool/result'; data: unknown }>;
}

export async function collectFailureTurn(
  source: DiagnosticBundleSource,
  channelId: string,
  messageId: string,
  redactor: DiagnosticRedactor,
): Promise<FailureTurnEvidence> {
  const card = source.channels.message(channelId, messageId);
  const failure = card?.sessionFailure;
  if (!card || card.author.kind !== 'bot' || !failure?.requestMessageId)
    throw new DiagnosticBundleError('invalid-input', 'Select a failed turn');
  const request = source.channels.message(channelId, failure.requestMessageId);
  if (!request || request.author.kind !== 'human')
    throw new DiagnosticBundleError('message-not-found', 'Original request unavailable');
  const events = await source.readSession(failure.sessionId);
  if (!events) throw new DiagnosticBundleError('message-not-found', 'Turn unavailable');
  const startTime = Date.parse(request.at);
  const endTime = Date.parse(card.at);
  let start = -1;
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    if (event.time > endTime) break;
    if (event.type === 'turn/start' && event.time >= startTime) start = i;
  }
  if (start < 0) throw new DiagnosticBundleError('message-not-found', 'Turn unavailable');
  for (let i = start - 1; i >= 0; i--) {
    if (events[i]!.type === 'turn/end' || events[i]!.type === 'turn/start') break;
    if (events[i]!.type === 'user/message') start = i;
  }
  const prompt: string[] = [];
  const toolCalls: FailureTurnEvidence['toolCalls'] = [];
  for (const event of events.slice(start)) {
    if (event.time > endTime || event.type === 'turn/end') break;
    if (event.type === 'user/message') {
      const data = event.data;
      if (data && typeof data === 'object' && 'content' in data && Array.isArray(data.content))
        for (const part of data.content)
          if (
            part &&
            typeof part === 'object' &&
            part.type === 'text' &&
            typeof part.text === 'string'
          )
            prompt.push(part.text);
    } else if (event.type === 'tool/call' || event.type === 'tool/result') {
      toolCalls.push({ type: event.type, data: event.data });
    }
  }
  if (!prompt.some((text) => text.includes(`Channel: ${channelId}\nMessage ID: ${request.id}\n`)))
    throw new DiagnosticBundleError('message-not-found', 'Cannot identify the failed request');
  const evidence = redactor.value({
    prompt: prompt.filter((text) =>
      text.includes(`Channel: ${channelId}\nMessage ID: ${request.id}\n`),
    ),
    toolCalls,
  });
  if (Buffer.byteLength(JSON.stringify(evidence)) > 128 * 1024)
    throw new DiagnosticBundleError('too-large', 'Use the diagnostic download for this turn');
  return evidence;
}
