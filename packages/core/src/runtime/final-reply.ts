export type FinalReply =
  | { action: 'reply'; text: string; complete: boolean }
  | { action: 'silent' };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidReply(): never {
  throw new Error('Invalid deepseekbot_reply envelope');
}

export function parseFinalReply(text: string): FinalReply | undefined {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    if (/^\s*\{\s*"deepseekbot_reply"/u.test(text)) invalidReply();
    return undefined;
  }
  if (!record(envelope) || !Object.hasOwn(envelope, 'deepseekbot_reply')) return undefined;
  if (Object.keys(envelope).length !== 1) invalidReply();
  const reply = envelope.deepseekbot_reply;
  if (!record(reply)) invalidReply();
  const keys = Object.keys(reply);
  if (reply.action === 'silent') {
    if (keys.length !== 1) invalidReply();
    return { action: reply.action };
  }
  if (
    reply.action !== 'reply' ||
    keys.length !== 3 ||
    typeof reply.text !== 'string' ||
    reply.text.trim().length === 0 ||
    typeof reply.complete !== 'boolean'
  )
    invalidReply();
  return { action: 'reply', text: reply.text, complete: reply.complete };
}
