import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { seededBannerRecipe } from '@botharness/pixel-banner';
import { createTestRegistry } from './registry-fixture.js';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBotModeSettings } from '../src/runtime/bot-mode-settings.js';
import { afterEach, describe, expect, it } from 'vitest';
import { seededAvatarFor } from '../src/bots/avatar-appearance.js';
import { fallbackPrimaryColor, resolveBotPrimaryColor } from '../src/bots/primary-color.js';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('lists PersonaBots with their aggregate state', () => {
    const { registry, states, methods } = setup();
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['研究'],
      description: '数学与计算',
      workspaces: ['/tmp/ada'],
    });
    states.setSessionState('ada', 'session-1', 'working');

    const result = methods.list({});

    expect(result).toEqual({
      ok: true,
      value: {
        bots: [
          {
            ownerHumanId: 'local-human',
            owner: true,
            approvalTemplate: '@global',
            slug: 'ada',
            displayName: 'Ada',
            roles: ['研究'],
            description: '数学与计算',
            aggregateState: 'working',
            workspaces: ['/tmp/ada'],
            createdAt: expect.any(String),
            banner: {
              recipe: expect.objectContaining({ seed: expect.any(Number) }),
            },
            avatarSeed: 2,
            standingLimits: { soul: 5000, coreMemory: 3000 },
          },
        ],
      },
    });
  });

  it('returns empty roles and omits description when the record has none', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'plain', displayName: 'Plain' });

    const result = methods.list({});

    expect(result).toEqual({
      ok: true,
      value: {
        bots: [
          {
            ownerHumanId: 'local-human',
            owner: true,
            approvalTemplate: '@global',
            slug: 'plain',
            displayName: 'Plain',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: expect.any(String),
            banner: {
              recipe: expect.objectContaining({ seed: expect.any(Number) }),
            },
            avatarSeed: 2,
            standingLimits: { soul: 5000, coreMemory: 3000 },
          },
        ],
      },
    });
  });

  it('carries role badges and description into the detail read model', () => {
    const { registry, methods } = setup();
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['研究'],
      description: '数学与计算',
    });

    const result = methods.get({ slug: 'ada' });

    expect(result.ok && result.value.bot).toMatchObject({
      roles: ['研究'],
      description: '数学与计算',
      memoryDir: registry.memoryDirFor('ada'),
    });
  });

  it('filters by display name or role badge, never by internal ID', () => {
    const { registry, methods } = setup();
    registry.create({
      slug: 'hidden-ada',
      displayName: 'Ada Lovelace',
      roles: ['研究员'],
    });
    registry.create({ slug: 'hidden-bob', displayName: 'Bob' });

    const byName = methods.list({ query: 'love' });
    const byRole = methods.list({ query: '研究' });
    const byInternalId = methods.list({ query: 'hidden-bob' });

    expect(byName.ok && byName.value.bots.map((bot) => bot.slug)).toEqual(['hidden-ada']);
    expect(byRole.ok && byRole.value.bots.map((bot) => bot.slug)).toEqual(['hidden-ada']);
    expect(byInternalId.ok && byInternalId.value.bots).toEqual([]);
  });

  it('returns a structured not-found failure for unknown slugs', () => {
    const { methods } = setup();

    expect(methods.get({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
  });

  it('creates a bot with persona, profile fields and a custom avatar', () => {
    const { root, methods } = setup();

    const result = methods.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n\nBe kind.\n',
      roles: ['研究'],
      description: '数学与计算',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/ada'],
      avatar:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        bot: {
          ownerHumanId: 'local-human',
          owner: true,
          approvalTemplate: '@global',
          slug: 'ada',
          displayName: 'Ada',
          roles: ['研究'],
          description: '数学与计算',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          aggregateState: 'idle',
          workspaces: ['/srv/ada'],
          createdAt: expect.any(String),
          banner: {
            recipe: expect.objectContaining({ seed: expect.any(Number) }),
          },
          avatarSeed: 2,
          standingLimits: { soul: 5000, coreMemory: 3000 },
          model: 'deepseek-chat',
          preset: 'standard',
          sessions: {},
        },
      },
    });
    expect(createTestRegistry({ rootDir: root }).get('ada')).toMatchObject({
      slug: 'ada',
      avatar: expect.stringMatching(/^data:image\/png;base64,/u),
      roles: ['研究'],
      description: '数学与计算',
    });
    expect(readFileSync(join(root, 'ada', 'memory', 'SOUL.md'), 'utf8')).toBe(
      '# Ada\n\nBe kind.\n',
    );
  });

  it('reports a missing Git prerequisite without exposing a spawn error', () => {
    const { registry, methods } = setup();
    registry.create = () => ({
      ok: false,
      reason: 'git-not-found',
      detail: 'spawn git ENOENT',
    });

    expect(methods.create({ displayName: 'No Git' })).toEqual({
      ok: false,
      error: {
        code: 'git-not-found',
        message: 'Install Git, make it available on PATH, restart DeepSeek Harness, then retry.',
      },
    });
    expect(registry.list()).toEqual([]);
  });

  it('creates a name-only bot with its Memory directory and no Persona file', () => {
    const { root, methods } = setup([], ['plain']);

    expect(methods.create({ displayName: 'Plain' }).ok).toBe(true);
    expect(existsSync(join(root, 'plain', 'memory'))).toBe(true);
    expect(existsSync(join(root, 'plain', 'memory', 'SOUL.md'))).toBe(false);
  });

  it('writes a supplied Core Memory instead of the template', () => {
    const { root, methods } = setup([], ['cored']);

    expect(methods.create({ displayName: 'Cored', coreMemory: '# Core\n- Fridays' }).ok).toBe(true);
    expect(readFileSync(join(root, 'cored', 'memory', 'MEMORY.md'), 'utf8')).toBe(
      '# Core\n- Fridays',
    );
    expect(methods.create({ displayName: 'Bad', coreMemory: 7 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid create payload' },
    });
  });

  it('creates Memory under a Human-chosen location and refuses a relative one', () => {
    const { root, methods } = setup([], ['bot-located', 'bot-relative']);
    const location = join(root, 'chosen');
    mkdirSync(location, { recursive: true });

    const created = methods.create({
      displayName: 'Located',
      memoryLocation: location,
    });
    expect(created.ok && created.value.bot.memoryDir).toBe(join(location, 'bot-located'));
    expect(existsSync(join(location, 'bot-located'))).toBe(true);
    expect(methods.create({ displayName: 'Relative', memoryLocation: 'chosen' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-memory-dir' },
    });
    expect(
      methods.create({
        displayName: 'Missing',
        memoryLocation: join(root, 'missing'),
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-memory-dir' } });
    expect(methods.create({ displayName: 'Bad', memoryLocation: 7 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid create payload' },
    });
  });

  it('owns ID generation and reports malformed Human-facing fields', () => {
    const { root, methods } = setup([], ['bot-generated', 'bot-generated']);

    expect(methods.create({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ displayName: 42 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ displayName: 'Ada', roles: '研究员' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid create payload' },
    });

    const created = methods.create({
      slug: 'caller-choice',
      displayName: 'Ada',
    });
    expect(created.ok && created.value.bot.slug).toBe('bot-generated');
    expect(createTestRegistry({ rootDir: root }).get('bot-generated')).toBeDefined();
    expect(existsSync(join(root, 'bot-generated', 'bot.json'))).toBe(false);
    expect(existsSync(join(root, 'caller-choice', 'bot.json'))).toBe(false);
    expect(methods.create({ displayName: '同名 Ada' })).toEqual({
      ok: false,
      error: {
        code: 'duplicate',
        message: 'PersonaBot already exists: bot-generated',
      },
    });
  });

  it('allows duplicate display names because mention identity stays on the generated ID', () => {
    const { methods } = setup([], ['bot-one', 'bot-two']);

    const first = methods.create({ displayName: '小研' });
    const second = methods.create({ displayName: '小研' });

    expect(first.ok && first.value.bot.slug).toBe('bot-one');
    expect(second.ok && second.value.bot.slug).toBe('bot-two');
  });

  it('guards explicit CLI profile updates with the observed fingerprint while keeping the existing UI update path', () => {
    const { registry, methods } = setup();
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      description: 'Before',
      roles: ['old'],
    });
    const before = methods.get({ slug: 'ada' });
    if (!before.ok) throw new Error('missing Bot');
    expect(before.value.profileFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      methods.update({
        slug: 'ada',
        expectedProfile: before.value.profileFingerprint,
        patch: { description: '', roles: [] },
      }).ok,
    ).toBe(true);
    const changed = registry.get('ada');
    expect(changed?.description).toBeUndefined();
    expect(changed?.roles).toBeUndefined();
    expect(
      methods.update({
        slug: 'ada',
        expectedProfile: before.value.profileFingerprint,
        patch: { displayName: 'Stale overwrite' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'stale-profile' } });
    expect(registry.get('ada')).toEqual(changed);
    expect(
      methods.update({
        slug: 'ada',
        expectedProfile: 42,
        patch: { displayName: 'Bad fingerprint' },
      }).ok,
    ).toBe(false);
    expect(methods.update({ slug: 'ada', patch: { displayName: 'UI update' } }).ok).toBe(true);
    expect(registry.get('ada')?.displayName).toBe('UI update');
  });

  it('updates editable fields and leaves persona untouched', () => {
    const { root, methods } = setup();
    methods.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n\nOriginal.\n',
      roles: ['old'],
    });

    const result = methods.update({
      slug: 'ada',
      patch: {
        displayName: 'Ada Lovelace',
        roles: ['   '],
        description: '数学与计算',
        model: 'deepseek-chat',
        preset: 'standard',
        workspaces: ['/srv/ada'],
        avatar:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=',
        persona: '# Evil\n',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        bot: {
          ownerHumanId: 'local-human',
          owner: true,
          approvalTemplate: '@global',
          slug: 'ada',
          displayName: 'Ada Lovelace',
          roles: [],
          description: '数学与计算',
          avatar: expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u),
          aggregateState: 'idle',
          workspaces: ['/srv/ada'],
          createdAt: expect.any(String),
          banner: {
            recipe: expect.objectContaining({ seed: expect.any(Number) }),
          },
          avatarSeed: 2,
          standingLimits: { soul: 5000, coreMemory: 3000 },
          model: 'deepseek-chat',
          preset: 'standard',
          sessions: {},
        },
      },
    });
    expect(readFileSync(join(root, 'ada', 'memory', 'SOUL.md'), 'utf8')).toBe(
      '# Ada\n\nOriginal.\n',
    );
  });

  it('stores per-Bot standing limits and returns to the defaults', () => {
    const { root, methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const updated = methods.standingLimitsSet({
      slug: 'ada',
      soul: 8000,
      coreMemory: 1200,
    });

    expect(updated.ok && updated.value.bot.standingLimits).toEqual({
      soul: 8000,
      coreMemory: 1200,
    });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.standingLimits).toEqual({
      soul: 8000,
      coreMemory: 1200,
    });

    methods.standingLimitsSet({ slug: 'ada', soul: 5000, coreMemory: 3000 });
    expect(createTestRegistry({ rootDir: root }).get('ada')?.standingLimits).toBeUndefined();
  });

  it('rejects standing limits outside the allowed range', () => {
    const { methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    for (const payload of [
      { slug: 'ada', soul: 499, coreMemory: 3000 },
      { slug: 'ada', soul: 5000, coreMemory: 50_001 },
      { slug: 'ada', soul: 5000.5, coreMemory: 3000 },
      { slug: 'ada', soul: '5000', coreMemory: 3000 },
    ]) {
      expect(methods.standingLimitsSet(payload)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    expect(
      methods.standingLimitsSet({
        slug: 'missing',
        soul: 5000,
        coreMemory: 3000,
      }),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('keeps a profile update inside the Bot mode template', () => {
    const modeHome = mkdtempSync(join(tmpdir(), 'botharness-modes-'));
    roots.push(modeHome);
    const settings = createBotModeSettings(modeHome);
    const { methods } = setup(
      [],
      ['ada'],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { settings, productDefault: 'deepseekbot', roster: async () => [] },
    );
    methods.create({ slug: 'ada', displayName: 'Ada' });
    settings.setTemplateOf('ada', settings.saveTemplate({ name: 'Coding', modes: ['ptc'] }).id);
    expect(methods.update({ slug: 'ada', patch: { preset: 'acp' } })).toMatchObject({
      ok: false,
      error: { code: 'mode-not-allowed' },
    });
    expect(methods.update({ slug: 'ada', patch: { preset: 'ptc' } })).toMatchObject({ ok: true });
    expect(methods.update({ slug: 'ada', patch: { preset: '' } })).toMatchObject({ ok: true });
  });

  it('rejects unknown or malformed updates', () => {
    const { methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.update({ slug: 'missing', patch: { roles: ['x'] } })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
    expect(methods.update({ slug: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'patch is required' },
    });
    expect(methods.update({ slug: 'ada', patch: { displayName: '   ' } })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid update payload' },
    });
    expect(methods.update({ slug: 'ada', patch: { workspaces: 'nope' } })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid update payload' },
    });
    expect(methods.update({ slug: 'ada', patch: {} })).toMatchObject({
      ok: true,
      value: { bot: { slug: 'ada', displayName: 'Ada' } },
    });
    const limits = {
      code: 'invalid-input',
      message: 'tags or bio exceed the profile limits',
    };
    expect(methods.update({ slug: 'ada', patch: { description: 'b'.repeat(161) } })).toEqual({
      ok: false,
      error: limits,
    });
    expect(methods.update({ slug: 'ada', patch: { roles: ['x'.repeat(33)] } })).toEqual({
      ok: false,
      error: limits,
    });
    expect(
      methods.update({
        slug: 'ada',
        patch: { roles: Array.from({ length: 9 }, (_, i) => `t${i}`) },
      }),
    ).toEqual({ ok: false, error: limits });
    expect(
      methods.update({
        slug: 'ada',
        patch: { roles: ['Notes'], description: 'b'.repeat(160) },
      }),
    ).toMatchObject({ ok: true, value: { bot: { roles: ['Notes'] } } });
  });

  it('pauses and resumes a bot, exposing paused in the read model', () => {
    const { registry, methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const paused = methods.pause({ slug: 'ada' });
    expect(paused.ok && paused.value.bot.paused).toBe(true);
    expect(registry.get('ada')?.paused).toBe(true);
    const listed = methods.list({});
    expect(listed.ok && listed.value.bots[0]?.paused).toBe(true);

    const resumed = methods.resume({ slug: 'ada' });
    expect(resumed.ok && 'paused' in resumed.value.bot).toBe(false);
    expect(registry.get('ada')?.paused).toBeUndefined();

    expect(methods.pause({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
    expect(methods.resume({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
  });

  it('saves an illustrated appearance through its DM, derives a bounded snapshot, and preserves it after rejected input', async () => {
    const { root, registry, channels, methods, states } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const recipe = {
      schemaVersion: 1,
      family: 'illustrated',
      assetVersion: 1,
      rigVersion: 1,
      head: 'round',
      pose: 'left',
      hair: 'sweep',
      eyes: 'sparkle',
      brows: 'raised',
      nose: 'dot',
      mouth: 'grin',
      cheeks: 'freckles',
      glasses: 'round',
      outfit: 'sailor',
      backdrop: 'hearts',
      accessory: 'headphones',
      skinColor: '#ebbd9f',
      hairColor: '#44332c',
      eyeColor: '#2f9e8f',
      shirtColor: '#6c8cbd',
    };
    const result = methods.botAppearanceSet({ channelId: dm.id, recipe });
    expect(result).toMatchObject({
      ok: true,
      value: {
        bot: {
          appearance: { recipe },
          avatar: expect.stringContaining('/bot-avatar?slug=ada'),
        },
      },
    });
    const saved = registry.get('ada')!;
    expect(saved.appearance?.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.avatar).toMatch(/^data:image\/png;base64,/);
    const bytes = Buffer.from(saved.avatar!.split(',')[1]!, 'base64');
    expect(bytes.byteLength).toBeLessThanOrEqual(131_072);
    expect(bytes.readUInt32BE(16)).toBe(512);
    expect(bytes.readUInt32BE(20)).toBe(512);
    expect(createTestRegistry({ rootDir: root }).get('ada')).toEqual(saved);
    expect(methods.list({})).toMatchObject({
      ok: true,
      value: {
        bots: [{ appearance: { recipe, revision: saved.appearance?.revision } }],
      },
    });
    states.setApprovalCount('ada', 2);
    for (const invalid of [
      { ...recipe, head: 'unknown' },
      { ...recipe, accessory: 'glasses' },
      { ...recipe, hairColor: 'url(https://evil)' },
      { ...recipe, rigVersion: 9 },
      { ...recipe, script: 'payload' },
    ]) {
      expect(methods.botAppearanceSet({ channelId: dm.id, recipe: invalid })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(registry.get('ada')).toEqual(saved);
    }
    expect(
      methods.botAppearanceSet({
        channelId: channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Group', members: ['ada'] })
          .id,
        recipe,
      }),
    ).toMatchObject({ ok: false });
    expect(states.snapshot('ada').attention).toEqual({ approvalCount: 2 });
    const { createBotAvatarHttp, BOT_AVATAR_PATH } = await import('../src/bots/avatar-http.js');
    const response = await createBotAvatarHttp(registry)(
      new Request(`http://host${BOT_AVATAR_PATH}?slug=ada`),
    );
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(methods.botAvatarSet({ channelId: dm.id, avatar: null }).ok).toBe(true);
    expect(registry.get('ada')?.appearance).toBeUndefined();
    expect(registry.get('ada')?.avatar).toBeUndefined();
  });

  it('saves a Bot Primary Color through the DM and keeps it across rename, Avatar edits and restart', () => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
    const { root, registry, channels, methods } = setup();
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: ['ada'] });
    const subject = () => registry.get('ada')!;
    const listed = () => {
      const result = methods.list({});
      if (!result.ok) throw new Error('list failed');
      return result.value.bots.find((bot) => bot.slug === 'ada')!;
    };

    expect(subject().primaryColor).toBeUndefined();
    expect(listed().primaryColor).toBeUndefined();
    expect(resolveBotPrimaryColor(subject())).toEqual({
      mode: 'automatic',
      source: 'hair',
      color: seededAvatarFor('Ada', subject().avatarSeed).hairColor,
    });

    const custom = { mode: 'custom', color: '#1D1B22' };
    expect(methods.botPrimaryColorSet({ channelId: dm.id, primaryColor: custom })).toMatchObject({
      ok: true,
      value: { bot: { primaryColor: { mode: 'custom', color: '#1d1b22' } } },
    });
    const saved = { mode: 'custom', color: '#1d1b22' };
    expect(subject().primaryColor).toEqual(saved);
    expect(listed().primaryColor).toEqual(saved);

    for (const invalid of [
      null,
      'custom',
      { mode: 'custom' },
      { mode: 'custom', color: 'red' },
      { mode: 'custom', color: 'url(https://evil)' },
      { mode: 'custom', color: '#1d1b22', fallback: '#ffffff' },
      { mode: 'automatic', color: '#1d1b22' },
      { mode: 'theme', color: '#1d1b22' },
    ]) {
      expect(methods.botPrimaryColorSet({ channelId: dm.id, primaryColor: invalid })).toMatchObject(
        { ok: false, error: { code: 'invalid-input' } },
      );
      expect(subject().primaryColor).toEqual(saved);
    }
    expect(
      methods.botPrimaryColorSet({
        channelId: group.id,
        primaryColor: { mode: 'automatic' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      methods.botPrimaryColorSet({
        channelId: 'missing',
        primaryColor: { mode: 'automatic' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(subject().primaryColor).toEqual(saved);

    expect(registry.update('ada', { displayName: 'Ada Lovelace' }).ok).toBe(true);
    const recipe = {
      ...seededAvatarFor('Ada', undefined),
      hairColor: '#3fc1b8',
    };
    expect(methods.botAppearanceSet({ channelId: dm.id, recipe }).ok).toBe(true);
    expect(methods.botAvatarSet({ channelId: dm.id, avatar: image }).ok).toBe(true);
    expect(subject().primaryColor).toEqual(saved);
    expect(resolveBotPrimaryColor(subject())).toMatchObject({
      source: 'custom',
      color: '#1d1b22',
    });

    const reopened = createTestRegistry({ rootDir: root });
    expect(reopened.get('ada')?.primaryColor).toEqual(saved);

    expect(
      methods.botPrimaryColorSet({
        channelId: dm.id,
        primaryColor: { mode: 'automatic' },
      }),
    ).toMatchObject({ ok: true });
    expect(subject().primaryColor).toBeUndefined();
    expect(createTestRegistry({ rootDir: root }).get('ada')?.primaryColor).toBeUndefined();
    const fallback = resolveBotPrimaryColor(subject());
    expect(fallback).toEqual({
      mode: 'automatic',
      source: 'fallback',
      color: fallbackPrimaryColor('ada'),
    });
    expect(registry.update('ada', { displayName: 'Renamed' }).ok).toBe(true);
    expect(resolveBotPrimaryColor(subject())).toEqual(fallback);

    expect(methods.botAppearanceSet({ channelId: dm.id, recipe }).ok).toBe(true);
    expect(resolveBotPrimaryColor(subject())).toMatchObject({
      source: 'hair',
      color: '#3fc1b8',
    });
  });

  it('sets a banner scene inside the DM and resets it to the name-seeded one', () => {
    const { registry, channels, methods } = setup();
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
    const recipe = { scene: 'night-sky', seed: 12 };

    expect(methods.botBannerSet({ channelId: dm.id, banner: { recipe } })).toMatchObject({
      ok: true,
      value: { bot: { banner: { recipe } } },
    });
    expect(registry.get('ada')?.banner).toEqual({ recipe });
    expect(
      methods.botBannerSet({
        channelId: dm.id,
        banner: { recipe: { scene: 'mars', seed: 1 } },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(methods.botBannerSet({ channelId: group.id, banner: null })).toMatchObject({
      ok: false,
    });

    expect(registry.update('ada', { displayName: 'Ada Lovelace' }).ok).toBe(true);
    expect(methods.botBannerSet({ channelId: dm.id, banner: null }).ok).toBe(true);
    expect(registry.get('ada')?.banner).toEqual({
      recipe: seededBannerRecipe('Ada Lovelace'),
    });
  });

  it('sets, maps, and clears one PersonaBot custom avatar inside its DM', () => {
    const avatar =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
    const { registry, channels, methods } = setup();
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Team', members: [] });
    const avatarUrl = expect.stringMatching(/^\/api\/botharness\/bot-avatar\?slug=ada&v=/u);

    const set = methods.botAvatarSet({ channelId: dm.id, avatar });
    expect(set).toMatchObject({
      ok: true,
      value: { bot: { avatar: avatarUrl } },
    });
    expect(registry.get('ada')?.avatar).toBe(avatar);
    expect(methods.list({})).toMatchObject({
      ok: true,
      value: { bots: [{ avatar: avatarUrl }] },
    });

    expect(
      methods.botAvatarSet({
        channelId: dm.id,
        avatar: 'https://example.com/ada.png',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      methods.botAvatarSet({
        channelId: dm.id,
        avatar: 'data:image/svg+xml;base64,AAAA',
      }),
    ).toMatchObject({ ok: false });
    expect(methods.botAvatarSet({ channelId: group.id, avatar: null })).toMatchObject({
      ok: false,
    });

    const cleared = methods.botAvatarSet({ channelId: dm.id, avatar: null });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.value.bot.avatar).toBeUndefined();
    expect(registry.get('ada')?.avatar).toBeUndefined();
  });
});
