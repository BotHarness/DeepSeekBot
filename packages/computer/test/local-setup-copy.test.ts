import { expect, it } from 'vitest';
import { en, zh, type ComputerTranslate } from '../src/client/locale.js';
import { localSetupFailure } from '../src/client/local-setup-copy.js';

it.each([
  'permissions-required',
  'disk-full',
  'runtime-write-refused',
  'download-failed',
  'verification-failed',
  'installation-failed',
  'settings-open-failed',
  'target-changed',
  'request-failed',
  undefined,
  'private-path-error',
])('localizes %s without exposing raw diagnostics', (code) => {
  const translate = (messages: typeof en): ComputerTranslate =>
    ((key: keyof typeof en) => messages[key]) as ComputerTranslate;
  const english = localSetupFailure(code, translate(en));
  const chinese = localSetupFailure(code, translate(zh));
  expect(english).not.toBe(chinese);
  expect(chinese).toMatch(/[\u4e00-\u9fff]/u);
  expect(english).not.toContain('private-path-error');
  expect(chinese).not.toContain('private-path-error');
});
