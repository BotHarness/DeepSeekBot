import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import { createPrivateRelay } from '../../../deploy/private-relay/server.mjs';
import {
  browserAdmissionProtocols,
  consumeBrowserAdmission,
  BROWSER_ADMISSION_PROTOCOL,
  privateAdmissionFromHeaders,
} from '../../../deploy/private-relay/admission.mjs';
import { createTempRoot } from './helpers.js';

it('consumes exactly one browser admission and never selects the credential protocol', async () => {
  const token = 'ab'.repeat(32);
  const protocol = browserAdmissionProtocols(token).join(', ');
  expect(privateAdmissionFromHeaders(`Bearer ${token}`, token, protocol)).toEqual({
    token,
    protocol: BROWSER_ADMISSION_PROTOCOL,
  });
  for (const input of [
    [`Bearer ${token}`, 'ff'.repeat(32), protocol],
    [`Bearer ${'ff'.repeat(32)}`, token, protocol],
    [`Bearer ${token}`, token, browserAdmissionProtocols('ff'.repeat(32)).join(', ')],
    ['bad', token, undefined],
    [undefined, [token, token], undefined],
  ])
    expect(privateAdmissionFromHeaders(input[0], input[1], input[2])).toBeUndefined();
  expect(consumeBrowserAdmission(browserAdmissionProtocols(token).join(', '))).toEqual({
    token,
    protocol: BROWSER_ADMISSION_PROTOCOL,
  });
  for (const value of [
    undefined,
    BROWSER_ADMISSION_PROTOCOL,
    `${BROWSER_ADMISSION_PROTOCOL}, botharness-admission.bad`,
    `${BROWSER_ADMISSION_PROTOCOL}, botharness-admission.${token}, extra`,
    `botharness-admission.${token}, ${BROWSER_ADMISSION_PROTOCOL}`,
  ])
    expect(consumeBrowserAdmission(value)).toBeUndefined();
  const relay = createPrivateRelay({
    directory: createTempRoot('browser-private-relay-'),
    bootstrap: 'cd'.repeat(32),
  });
  relay.server.listen(0, '127.0.0.1');
  await once(relay.server, 'listening');
  const origin = `http://127.0.0.1:${(relay.server.address() as AddressInfo).port}`;
  let host: WebSocket | undefined;
  let phone: WebSocket | undefined;
  try {
    expect(
      (
        await fetch(origin + '/claim', {
          method: 'POST',
          headers: { Authorization: `Bearer ${'cd'.repeat(32)}` },
          body: JSON.stringify({ ownerToken: 'ef'.repeat(32), phoneToken: token }),
        })
      ).status,
    ).toBe(200);
    host = new WebSocket(origin.replace('http', 'ws') + '/host', {
      headers: { Authorization: `Bearer ${'ef'.repeat(32)}` },
    });
    await once(host, 'open');
    const incoming = once(host, 'message');
    phone = new WebSocket(
      origin.replace('http', 'ws') + '/botharness-device/channel',
      browserAdmissionProtocols(token),
    );
    await once(phone, 'open');
    expect(phone.protocol).toBe(BROWSER_ADMISSION_PROTOCOL);
    expect(String((await incoming)[0])).not.toContain(token);
    const refused = new WebSocket(
      origin.replace('http', 'ws') + '/botharness-device/channel',
      browserAdmissionProtocols('ff'.repeat(32)),
    );
    const failure = await once(refused, 'error');
    expect(String(failure[0])).toContain('403');
    const conflict = new WebSocket(
      origin.replace('http', 'ws') + '/botharness-device/channel',
      browserAdmissionProtocols(token),
      { headers: { Authorization: `Bearer ${token}`, 'X-BotHarness-Admission': 'ff'.repeat(32) } },
    );
    expect(String((await once(conflict, 'error'))[0])).toContain('403');
  } finally {
    phone?.terminate();
    host?.terminate();
    relay.close();
  }
});
