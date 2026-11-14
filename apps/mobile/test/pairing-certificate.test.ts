import { expect, it } from 'vitest';
import { channelFailure } from '../src/host/pairing';
import { pairingFailureText } from '../src/ui/pairing-failure';
import { interfacePreferences } from '../src/ui/interface-preferences';

it('names an untrusted certificate on a private origin instead of a generic unreachable', () => {
  const route = 'https://bot.corp.internal';
  for (const reason of [
    'The certificate for this server is invalid.',
    'NSURLErrorDomain error -1202',
    '此服务器的证书无效。你可能正在连接一个伪装成“bot.corp.internal”的服务器。',
    'java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.',
  ])
    expect(channelFailure(route, reason, false)).toMatchObject({
      ok: false,
      code: 'certificate-untrusted',
    });
  expect(channelFailure(route, 'Connection refused', false)).toMatchObject({
    code: 'unreachable',
  });
  const previous = interfacePreferences.getSnapshot().language;
  try {
    interfacePreferences.setLanguage('en');
    expect(pairingFailureText('certificate-untrusted', 'qr')).toMatch(/certificate/u);
    interfacePreferences.setLanguage('zh');
    expect(pairingFailureText('certificate-untrusted', 'qr')).toMatch(/证书/u);
  } finally {
    interfacePreferences.setLanguage(previous);
  }
});
