import { describe, expect, it, vi } from 'vitest';

import { BridgeCallError } from '../src/client/bridge.js';
import {
  createMember,
  loadPublicChannels,
  loadTeamMode,
  parseTeamMode,
  setTeamMode,
  teamRefusal,
  validUsername,
} from '../src/client/team-bridge.js';
import { en, zh } from '../src/client/locale.js';
import { renderTeamSignInPage } from '../src/shared/team-sign-in-page.js';

const viewer = {
  humanId: 'local-human',
  kind: 'owner',
  displayName: 'Ada',
  mustChangePassword: false,
};

describe('Team mode bridge', () => {
  it('parses the Team mode view and drops malformed addresses', () => {
    const view = parseTeamMode({
      enabled: true,
      ownerPasswordSet: true,
      insecureHttpAllowed: false,
      memberUrls: ['https://host.example/botharness-device/team/', 7, ''],
      viewer,
    });
    expect(view.memberUrls).toEqual(['https://host.example/botharness-device/team/']);
    expect(view.viewer.kind).toBe('owner');
  });

  it('refuses a response without a valid viewer', () => {
    expect(() => parseTeamMode({ enabled: true, viewer: { humanId: 'x', kind: 'guest' } })).toThrow(
      'invalid teamMode response',
    );
  });

  it('surfaces Host refusal codes as typed refusals', async () => {
    const call = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'owner-password-required', message: 'set a password first', details: {} },
    }));
    const failure = await setTeamMode(call, true).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BridgeCallError);
    expect(teamRefusal(failure)).toBe('owner-password-required');
    expect(call).toHaveBeenCalledWith('teamModeSet', { enabled: true }, undefined);
    expect(teamRefusal(new BridgeCallError('something-else', 'x'))).toBeUndefined();
  });

  it('requires the one-time password in a create response', async () => {
    const member = { humanId: 'h-bob', username: 'bob', displayName: 'Bob', status: 'active' };
    await expect(
      createMember(async () => ({ ok: true, value: { member } }), {
        username: 'bob',
        displayName: 'Bob',
      }),
    ).rejects.toThrow('invalid memberCreate response');
    const created = await createMember(
      async () => ({ ok: true, value: { member, initialPassword: 'k3y-once' } }),
      { username: 'bob', displayName: 'Bob' },
    );
    expect(created.initialPassword).toBe('k3y-once');
  });

  it('keeps only well-formed public Channels', async () => {
    const channels = await loadPublicChannels(async () => ({
      ok: true,
      value: [
        { channelId: 'c1', name: 'General', memberCount: 3, joined: false },
        { channelId: 'c2' },
        { channelId: 'c3', name: 'Ops', memberCount: -1, joined: true, description: 'On call' },
      ],
    }));
    expect(channels).toEqual([
      { channelId: 'c1', name: 'General', memberCount: 3, joined: false },
      { channelId: 'c3', name: 'Ops', memberCount: 0, joined: true, description: 'On call' },
    ]);
  });

  it('reads the Team mode view through the teamMode method', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: { enabled: false, ownerPasswordSet: false, viewer },
    }));
    await loadTeamMode(call);
    expect(call).toHaveBeenCalledWith('teamMode', {}, undefined);
  });

  it('accepts the agreed username shape only', () => {
    expect(validUsername('bob')).toBe(true);
    expect(validUsername('bob.smith-2_x')).toBe(true);
    expect(validUsername('b')).toBe(false);
    expect(validUsername('Bob')).toBe(false);
    expect(validUsername('.bob')).toBe(false);
    expect(validUsername('a'.repeat(33))).toBe(false);
  });

  it('ships every Team string in both languages', () => {
    const keys = (table: Record<string, string>) =>
      Object.keys(table).filter((key) => key.startsWith('team.'));
    expect(keys(zh).sort()).toEqual(keys(en).sort());
    expect(keys(en).length).toBeGreaterThan(40);
  });
});

describe('Team sign-in page', () => {
  it('escapes the Host name and stamps the CSP nonce on inline code', () => {
    const html = renderTeamSignInPage({
      language: 'en',
      hostName: '<img src=x onerror=alert(1)>',
      nonce: 'n0nce',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<style nonce="n0nce">');
    expect(html).toContain('<script nonce="n0nce">');
    expect(html.match(/<script/gu)).toHaveLength(1);
  });

  it('disables the form and explains why on an insecure transport', () => {
    const html = renderTeamSignInPage({
      language: 'zh',
      hostName: 'Office',
      nonce: 'x',
      insecure: true,
    });
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('此地址不安全');
    expect(html).toMatch(/<button type="submit" disabled>/u);
  });

  it('posts to the sibling sign-in route and maps every refusal code', () => {
    const html = renderTeamSignInPage({ language: 'en', hostName: 'Office', nonce: 'x' });
    expect(html).toContain("fetch('sign-in'");
    for (const code of [
      'credentials-invalid',
      'rate-limited',
      'insecure-transport',
      'team-mode-off',
      'member-suspended',
    ])
      expect(html).toContain(`"${code}"`);
  });
});

describe('member view of Bot settings', () => {
  it('keeps Host configuration sections with the Owner', async () => {
    const { MEMBER_SETTINGS_SECTIONS, BOT_SETTINGS_SECTIONS } =
      await import('../src/client/bot-settings.js');
    for (const id of ['account', 'general', 'appearance', 'notifications', 'shortcuts', 'team'])
      expect(MEMBER_SETTINGS_SECTIONS.has(id)).toBe(true);
    for (const id of [
      BOT_SETTINGS_SECTIONS.models,
      BOT_SETTINGS_SECTIONS.imApps,
      BOT_SETTINGS_SECTIONS.devices,
      BOT_SETTINGS_SECTIONS.dataPrivacy,
      BOT_SETTINGS_SECTIONS.advanced,
      BOT_SETTINGS_SECTIONS.plugins,
      BOT_SETTINGS_SECTIONS.autoApproval,
    ])
      expect(MEMBER_SETTINGS_SECTIONS.has(id)).toBe(false);
  });
});
