import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalVideoClientState } from '../../../packages/computer/src/local-video-client';
import type { ConnectionState } from '../src/host/client';

const connected = {
  status: 'connected',
  route: 'http://192.168.1.2:4321',
} satisfies ConnectionState;
const idle: LocalVideoClientState = {
  status: 'idle',
  host: undefined,
  presenting: false,
  busy: false,
  code: undefined,
};

afterEach(() => vi.restoreAllMocks());

describe.each(['en-US', 'zh-CN'])('Computer recovery notices in %s', (locale) => {
  async function load() {
    vi.resetModules();
    const options = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...options,
      locale,
    });
    const { localVideoNotice } = await import('../src/ui/chat/local-video-notice');
    const { t } = await import('../src/ui/strings');
    const notice = (connection: ConnectionState, state = idle, nativeMissing = false) =>
      localVideoNotice({ connection, state, nativeMissing, mediaMounted: false });
    return { notice, t };
  }

  it('shows Wi-Fi and local-access checks during Host disconnect or a failed video request', async () => {
    const { notice, t } = await load();
    const expected = t.computerVideoConnectionIssue(t.pairRefused['lan-unreachable']);
    expect(
      notice({ ...connected, status: 'unreachable', attempt: 1, reason: 'raw private error' }),
    ).toBe(expected);
    expect(notice({ ...connected, status: 'reconnecting', attempt: 2 })).toBe(expected);
    expect(notice(connected, { ...idle, status: 'unavailable', code: 'connection-lost' })).toBe(
      expected,
    );
    expect(expected).toContain('Wi-Fi');
    expect(expected).not.toContain('raw private error');
  });

  it('keeps remote network checks separate from LAN requirements', async () => {
    const { notice, t } = await load();
    expect(
      notice({
        status: 'unreachable',
        route: 'https://phone.deepseekbot.dev',
        attempt: 1,
        reason: 'offline',
      }),
    ).toBe(t.computerVideoConnectionIssue(t.connectionNetworkHelp));
  });

  it('preserves uncertain input, pairing and missing-build recovery ahead of generic network advice', async () => {
    const { notice, t } = await load();
    const offline: ConnectionState = {
      ...connected,
      status: 'unreachable',
      attempt: 1,
      reason: 'network',
    };
    expect(notice(offline, { ...idle, code: 'input-result-unknown' })).toBe(
      t.computerVideoInputUnknown,
    );
    expect(
      notice({ ...connected, status: 'refused', code: 'device-revoked', reason: 'raw refusal' }),
    ).toBe(t.deviceRefusal['device-revoked']);
    expect(notice(offline, idle, true)).toBe(t.computerVideoBuildRequired);
  });

  it('keeps video setup, carrier and viewer recovery distinct and shows no normal-operation hint', async () => {
    const { notice, t } = await load();
    expect(notice(connected, { ...idle, status: 'unavailable', code: 'helper-start-failed' })).toBe(
      t.computerVideoUnavailable,
    );
    expect(notice(connected, { ...idle, code: 'connect-carrier-required' })).toBe(
      t.computerVideoCarrierRequired,
    );
    expect(notice(connected, { ...idle, code: 'viewer-limit' })).toBe(t.computerVideoViewerLimit);
    expect(notice(connected)).toBeUndefined();
    expect(notice({ ...connected, status: 'connecting' })).toBeUndefined();
  });
});
