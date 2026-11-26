import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { describe, expect, it } from 'vitest';
import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  parseOptional,
  parseRoles,
  parseStringArray,
  type BridgeError,
} from '../src/kernel/method-utils.js';
import { toRemoteError, unwrap, unwrapAsync } from '../src/kernel/rpc-result.js';

describe('Kernel RPC results', () => {
  it('retains the error code, message and preview details', () => {
    const error: BridgeError = {
      code: 'all-bot-preview-changed',
      message: 'Review the updated recipients',
      details: { preview: { revision: 'new', recipients: [{ botSlug: 'ada', label: 'Ada' }] } },
    };
    const remote = toRemoteError(error);
    expect(remote).toBeInstanceOf(RemoteError);
    expect(remote).toMatchObject(error);
    expect(toRemoteError({ code: 'not-found', message: 'missing' }).details).toEqual({});
  });

  it('unwraps values and throws or rejects with RemoteError for failed results', async () => {
    const value = { revision: 2 };
    const result = { ok: true, value } as const;
    const failure = invalidInput('Missing revision');
    expect(unwrap(result)).toBe(value);
    await expect(unwrapAsync(Promise.resolve(result))).resolves.toBe(value);
    expect(() => unwrap(failure)).toThrow(RemoteError);
    await expect(unwrapAsync(Promise.resolve(failure))).rejects.toMatchObject({
      name: 'RemoteError',
      code: 'invalid-input',
      message: 'Missing revision',
      details: {},
    });
  });

  it('preserves a rejection from the asynchronous operation', async () => {
    const original = new Error('Operation failed');
    await expect(unwrapAsync(Promise.reject(original))).rejects.toBe(original);
  });
});

describe('Kernel input parsing', () => {
  it('reads record fields and preserves nonblank strings as supplied', () => {
    const payload = { slug: 'ada', label: ' Ada ', blank: '  ' };
    expect(asObject(payload)).toBe(payload);
    expect(asObject(null)).toEqual({});
    expect(asObject('ada')).toEqual({});
    expect(asSlug(payload)).toBe('ada');
    expect(asSlug({ slug: '' })).toBeUndefined();
    expect(asNonBlank(payload, 'label')).toBe(' Ada ');
    expect(asNonBlank(payload, 'blank')).toBeUndefined();
  });

  it('distinguishes absent, valid and invalid optional strings', () => {
    expect(parseOptional({}, 'name')).toEqual({ ok: true, value: undefined });
    expect(parseOptional({ name: '' }, 'name')).toEqual({ ok: true, value: '' });
    expect(parseOptional({ name: null }, 'name')).toEqual({ ok: false });
  });

  it('returns a copy of valid arrays and rejects nonstring role entries', () => {
    const roles = ['owner', 'member'];
    const parsed = parseRoles({ roles });
    expect(parsed).toEqual({ ok: true, value: roles });
    expect(parsed.ok && parsed.value).not.toBe(roles);
    expect(parseRoles({ roles: ['owner', 2] })).toEqual({ ok: false });
    expect(parseStringArray({}, 'labels')).toEqual({ ok: true, value: undefined });
    expect(parseStringArray({ labels: [] }, 'labels')).toEqual({ ok: true, value: [] });
    expect(parseStringArray({ labels: 'one' }, 'labels')).toEqual({ ok: false });
  });
});
