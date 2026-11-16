import { expect, it } from 'vitest';
import { createPrivateHostRedactor } from '../private-host-redaction.mjs';

it('redacts navigation URLs and standalone credentials before bounded error output', () => {
  const url = 'http://127.0.0.1:12345/?token=synthetic-private-token#synthetic-private-fragment';
  const redact = createPrivateHostRedactor(url);
  const navigation = new Error('net::ERR_CONNECTION_REFUSED at ' + url);
  const messages = [
    navigation.message,
    'token synthetic-private-token, fragment synthetic-private-fragment',
    'x'.repeat(990) + url,
  ];
  const artifact = {
    error: redact(messages[0]).slice(0, 1000),
    pageErrors: messages.map((message) => redact(message).slice(0, 500)),
    stderr: redact(navigation.stack),
  };
  const output = JSON.stringify(artifact);
  expect(output).not.toContain(url);
  expect(output).not.toContain('synthetic-private-token');
  expect(output).not.toContain('synthetic-private-fragment');
  expect(artifact.error).toContain('ERR_CONNECTION_REFUSED');
  expect(artifact.error).toContain('[private Host URL]');
  expect(artifact.pageErrors[1]).toContain('[redacted]');
  expect(artifact.pageErrors.every((message) => message.length <= 500)).toBe(true);
});
it('preserves public diagnostics and handles token-free URLs', () => {
  expect(createPrivateHostRedactor('http://localhost:12345/')('public failure')).toBe(
    'public failure',
  );
  expect(createPrivateHostRedactor('http://localhost:12345/')(new Error('ordinary failure'))).toBe(
    'Error: ordinary failure',
  );
});
