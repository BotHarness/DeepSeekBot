export const COMPUTER_UNLOCK_PATH = '/api/computer/unlock';
export const COMPUTER_UNLOCK_TIMEOUT_MS = 20_000;
export const COMPUTER_UNLOCK_BODY_LIMIT = 8192;

export const computerUnlockCodes = [
  'ready',
  'ok',
  'unavailable',
  'invalid',
  'cancelled',
  'expired',
  'busy',
  'limited',
  'key-changed',
  'password-missing',
  'password-rejected',
  'face-id-required',
  'accessibility-required',
  'unlock-unavailable',
  'invalid-identity',
  'invalid-message',
] as const;

export type ComputerUnlockCode = (typeof computerUnlockCodes)[number];
export type ComputerUnlockOperation = 'verify' | 'unlock';
export type ComputerUnlockCommand =
  | { kind: 'status' }
  | { kind: 'begin'; operation: ComputerUnlockOperation }
  | { kind: 'finish'; operation: ComputerUnlockOperation; packet: string };

export interface ComputerUnlockReply {
  code: ComputerUnlockCode;
  locked?: boolean;
  offer?: string;
  receipt?: string;
}

export interface ComputerUnlockCaller {
  host: string;
  device: string;
}

export interface ComputerUnlockOwner {
  status(): Promise<Pick<ComputerUnlockReply, 'code' | 'locked'>>;
  handle(
    caller: ComputerUnlockCaller,
    command: unknown,
    signal: AbortSignal,
  ): Promise<ComputerUnlockReply>;
}

export function parseComputerUnlockReply(value: unknown): ComputerUnlockReply {
  if (!value || typeof value !== 'object' || !('code' in value)) return { code: 'unavailable' };
  const code = computerUnlockCodes.find((known) => known === value.code);
  if (code === undefined) return { code: 'unavailable' };
  return {
    code,
    ...('locked' in value && typeof value.locked === 'boolean' ? { locked: value.locked } : {}),
    ...('offer' in value && opaqueUnlockPacket(value.offer, 2048) ? { offer: value.offer } : {}),
    ...('receipt' in value && opaqueUnlockPacket(value.receipt, 128)
      ? { receipt: value.receipt }
      : {}),
  };
}

export function opaqueUnlockPacket(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= limit &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/u.test(value)
  );
}
