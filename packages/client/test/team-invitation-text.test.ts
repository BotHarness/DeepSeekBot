import { describe, expect, it } from 'vitest';
import { en, zhTranslate } from '../src/client/locale.js';
import { invitationText, loadMemberInvitation } from '../src/client/team-invitation-text.js';

const fingerprint = 'ab'.repeat(32);
const link = `deepseekbot://team?i=${Buffer.from(
  JSON.stringify({
    v: 1,
    host: { id: 'h', name: 'Studio', fingerprint },
    routes: ['https://studio.tail.ts.net'],
    username: 'erin',
    expiresAt: '2030-01-01T00:00:00Z',
  }),
).toString('base64url')}`;

describe('invitationText', () => {
  it('gives the phone link, the desktop address, username, one-time password and fingerprint', () => {
    const text = invitationText(zhTranslate, {
      link,
      username: 'erin',
      address: 'https://studio.tail.ts.net/',
      password: 'one-time-secret',
    });
    expect(text).toContain('Studio');
    expect(text).toContain(link);
    expect(text).toContain(
      '桌面端：在 Tobs「环境」里点「添加远程」→「以团队成员身份登录」，地址填 https://studio.tail.ts.net/',
    );
    expect(en['team.invite.text.desktop']).toBe(
      'Desktop: in Tobs Environments, choose Add remote → Sign in as a team member, and enter {address}',
    );
    expect(text).toContain('erin');
    expect(text).toContain('one-time-secret');
    expect(text).toContain(fingerprint);
  });
  it('leaves out the password for a resent invitation and the address when none is set', () => {
    const text = invitationText(zhTranslate, {
      link,
      username: 'erin',
      address: undefined,
      password: undefined,
    });
    expect(text).not.toContain(
      zhTranslate('team.invite.text.password', { password: '' }).slice(0, 4),
    );
    expect(text).not.toContain(
      zhTranslate('team.invite.text.desktop', { address: '' }).slice(0, 3),
    );
  });
});

describe('loadMemberInvitation', () => {
  it('asks the Host for the member invitation and checks its shape', async () => {
    const calls: unknown[] = [];
    const call = (async (method: string, payload: unknown) => {
      calls.push([method, payload]);
      return {
        ok: true,
        value: { link, expiresAt: '2030-01-01T00:00:00Z', qr: { size: 21, path: 'M0 0h1v1H0z' } },
      };
    }) as never;
    await expect(loadMemberInvitation(call, 'h-erin')).resolves.toMatchObject({ link });
    expect(calls[0]).toEqual(['memberInvitation', { humanId: 'h-erin' }]);
  });
});
