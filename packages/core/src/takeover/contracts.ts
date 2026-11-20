export const TAKEOVER_TARGETS = ['computer', 'browser'] as const;
export type TakeoverTarget = (typeof TAKEOVER_TARGETS)[number];

export const TAKEOVER_OUTCOMES = ['done', 'failed', 'cancelled', 'expired'] as const;
export type TakeoverOutcome = (typeof TAKEOVER_OUTCOMES)[number];

export type TakeoverStatus = 'pending' | TakeoverOutcome;

export type TakeoverResolver = 'human' | 'bot' | 'host';

export const TAKEOVER_TITLE_MAX = 80;
export const TAKEOVER_MESSAGE_MAX = 300;
export const TAKEOVER_DEFAULT_MINUTES = 30;
export const TAKEOVER_MAX_MINUTES = 120;

export interface TakeoverRequestCard {
  target: TakeoverTarget;
  title: string;
  expiresAt: string;
  sessionId?: string;
}

export interface TakeoverResolution {
  requestMessageId: string;
  outcome: TakeoverOutcome;
  by: TakeoverResolver;
}

export interface TakeoverHandoff {
  id: string;
  channelId: string;
  botSlug: string;
  target: TakeoverTarget;
  title: string;
  message: string;
  createdAt: string;
  expiresAt: string;
  status: TakeoverStatus;
  resolvedBy?: TakeoverResolver;
  resolvedAt?: string;
}

export const TAKEOVER_REFUSALS = [
  'unknown-bot',
  'invalid-input',
  'target-off',
  'channel-unavailable',
  'already-pending',
  'not-found',
  'not-pending',
] as const;
export type TakeoverRefusal = (typeof TAKEOVER_REFUSALS)[number];

export class TakeoverError extends Error {
  constructor(
    readonly code: TakeoverRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'TakeoverError';
  }
}

export function takeoverResolutionId(requestMessageId: string): string {
  return 'takeover-resolution-' + requestMessageId;
}

export function isTakeoverTarget(value: unknown): value is TakeoverTarget {
  return TAKEOVER_TARGETS.some((target) => target === value);
}

export function isTakeoverOutcome(value: unknown): value is TakeoverOutcome {
  return TAKEOVER_OUTCOMES.some((outcome) => outcome === value);
}

export function isTakeoverRequestCard(value: unknown): value is TakeoverRequestCard {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<string, unknown>;
  return (
    Object.keys(card).every((key) => ['target', 'title', 'expiresAt', 'sessionId'].includes(key)) &&
    isTakeoverTarget(card['target']) &&
    typeof card['title'] === 'string' &&
    card['title'].trim().length > 0 &&
    [...card['title']].length <= TAKEOVER_TITLE_MAX &&
    typeof card['expiresAt'] === 'string' &&
    Number.isFinite(Date.parse(card['expiresAt'])) &&
    (card['sessionId'] === undefined ||
      (typeof card['sessionId'] === 'string' && card['sessionId'].length > 0))
  );
}

export function isTakeoverResolution(value: unknown): value is TakeoverResolution {
  if (typeof value !== 'object' || value === null) return false;
  const resolution = value as Record<string, unknown>;
  return (
    Object.keys(resolution).every((key) => ['requestMessageId', 'outcome', 'by'].includes(key)) &&
    typeof resolution['requestMessageId'] === 'string' &&
    resolution['requestMessageId'].length > 0 &&
    isTakeoverOutcome(resolution['outcome']) &&
    ['human', 'bot', 'host'].includes(String(resolution['by']))
  );
}

export const TAKEOVER_TOOLS: ReadonlySet<string> = new Set([
  'takeover_request',
  'takeover_cancel',
  'takeover_list',
]);
