import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const key = randomBytes(32);

const FIELDS = {
  block: ['scope', 'source_event_id', 'target_name', 'app'],
  unblock: ['block_id', 'target_name'],
} as const;

function digest(action: 'block' | 'unblock', operation: Record<string, unknown>): string {
  const values = FIELDS[action].map((field) => String(operation[field] ?? ''));
  return createHmac('sha256', key)
    .update(JSON.stringify([action, ...values]))
    .digest('base64url');
}

export function sourceBlockToken(
  operation:
    | { action: 'block'; scope: string; source_event_id: string; target_name: string; app: string }
    | { action: 'unblock'; block_id: string; target_name: string },
): string {
  return digest(operation.action, operation);
}

export function sourceBlockTokenValid(operation: object): boolean {
  const fields = operation as Record<string, unknown>;
  const action = fields.action;
  if (action !== 'block' && action !== 'unblock') return false;
  if (FIELDS[action].some((field) => typeof fields[field] !== 'string' || fields[field] === ''))
    return false;
  if (action === 'block' && fields.scope !== 'sender' && fields.scope !== 'conversation')
    return false;
  const token = fields.confirm_token;
  if (typeof token !== 'string') return false;
  const expected = Buffer.from(digest(action, fields));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
