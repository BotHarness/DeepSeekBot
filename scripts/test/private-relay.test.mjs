import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('qualifies private relay admission, ciphertext forwarding and durable ownership', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--test',
      fileURLToPath(new URL('../../deploy/private-relay/server-check.mjs', import.meta.url)),
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 15_000 },
  );
  expect(output).toContain('fail 0');
});
