import { expect, it, vi } from 'vitest';
import { createTobHostCliOperations } from '../src/tob/cli-host-commands.js';

it.each([
  'device-offer',
  'device-pair',
  'device-account-pair',
  'device-approve-key',
  'browser-profile-pair',
  'browser-borrow-pair',
  'browser-daily-grant',
])('keeps %s in the Human CLI', (command) => {
  const run = vi.fn();
  const prepare = createTobHostCliOperations({ run });
  expect(() => prepare('cli', { argv: [command] })).toThrow('cli-command-refused');
  expect(run).not.toHaveBeenCalled();
});
