import { describe, expect, it } from 'vitest';

import { clearsPastedLink, pairingFailureText } from '../src/ui/pairing-failure';
import { t } from '../src/ui/strings';

describe('pairing failure text', () => {
  it('talks about the code when a scan fails', () => {
    expect(pairingFailureText('offer-expired', 'qr')).toBe(t.pairRefused['offer-expired']);
    expect(pairingFailureText('link-invalid', 'qr')).toBe(t.pairRefused['link-invalid']);
    expect(pairingFailureText('offer-expired', 'image')).toBe(t.pairRefused['offer-expired']);
    expect(pairingFailureText('link-invalid', 'image')).toBe(t.pairRefused['link-invalid']);
  });

  it('talks about the link when a pasted or opened link fails', () => {
    for (const method of ['paste', 'deep_link'] as const) {
      expect(pairingFailureText('link-invalid', method)).toBe(t.pairRefusedLink['link-invalid']);
      expect(pairingFailureText('offer-invalid', method)).toBe(t.pairRefusedLink['offer-invalid']);
      expect(pairingFailureText('offer-expired', method)).toBe(t.pairRefusedLink['offer-expired']);
    }
  });

  it('keeps the shared wording for failures that are not about the link', () => {
    expect(pairingFailureText('unreachable', 'paste')).toBe(t.pairRefused.unreachable);
    expect(pairingFailureText('no-route', 'paste')).toBe(t.pairRefused['no-route']);
  });
});

describe('clearing a pasted link', () => {
  it('clears a pasted link that can never pair', () => {
    for (const code of ['link-invalid', 'link-expired', 'offer-invalid', 'offer-expired'] as const)
      expect(clearsPastedLink(code, 'paste')).toBe(true);
  });

  it('keeps the link when the failure is not about it, or when nothing was pasted', () => {
    expect(clearsPastedLink('unreachable', 'paste')).toBe(false);
    expect(clearsPastedLink('storage-failure', 'paste')).toBe(false);
    expect(clearsPastedLink('offer-expired', 'qr')).toBe(false);
    expect(clearsPastedLink('offer-expired', 'deep_link')).toBe(false);
  });
});
