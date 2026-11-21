import { HOST_KEY_REJECTIONS } from './encrypted-carrier';
import { record } from './client-wire';

export type DeviceRefusal =
  | 'device-revoked'
  | 'device-unknown'
  | 'device-credential-missing'
  | 'host-key-changed'
  | 'sign-in-required'
  | 'member-suspended';

export const REFUSALS: Record<DeviceRefusal, string> = {
  'device-revoked': 'This phone was removed from the paired devices on your computer.',
  'device-unknown': 'Your computer no longer knows this phone.',
  'device-credential-missing': 'This phone has no pairing for your computer.',
  'host-key-changed': 'This computer no longer accepts this pairing. Remove it, then pair again.',
  'sign-in-required': 'Your password changed or you were signed out. Sign in again.',
  'member-suspended': 'Your account on this Host was deactivated.',
};

export class CredentialRefused extends Error {
  constructor(readonly code: DeviceRefusal) {
    super(REFUSALS[code]);
  }
}

export function deviceRefusal(error: unknown): DeviceRefusal | undefined {
  return error instanceof CredentialRefused ? error.code : undefined;
}

export function refusalOf(text: string): DeviceRefusal | undefined {
  try {
    const code = record(JSON.parse(text))['code'];
    if (code === 'credentials-invalid') return 'sign-in-required';
    return typeof code === 'string' && code in REFUSALS ? (code as DeviceRefusal) : undefined;
  } catch {
    return undefined;
  }
}

export class Unreachable extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function hostLacksMethod(error: unknown): boolean {
  return error instanceof Unreachable && error.status === 404;
}

export class MethodRefused extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function hostKeyRejected(error: unknown): error is MethodRefused {
  return error instanceof MethodRefused && HOST_KEY_REJECTIONS.has(error.code);
}
