import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  productDsh,
  productManifest,
  productImProvider,
  providerManifest,
} from '../product-artifacts.mjs';
import {
  packagedProfileManifest,
  packagedWorkspaceSettings,
  productAllowBuilds,
  verifiedProductArtifacts,
  verifyProductComposition,
  parseProductComposition,
} from '../packaged-profile.mjs';
import { parse } from 'yaml';
import { productManagedUpdate } from '../product-provider/update-policy.mjs';

vi.mock('../dev-im-provider.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    qualifiedImProvider: { source: 'unqualified-development-tip', dsh: 'unqualified' },
  };
});

const temporary = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function artifactSet(version = '0.0.0-test.823') {
  const root = mkdtempSync(join(tmpdir(), 'product-packages-'));
  temporary.push(root);
  const artifacts = [
    'deepseekbot',
    '@botharness/browser',
    '@botharness/computer',
    '@botharness/core',
    '@botharness/ui',
    productImProvider.name,
  ].map((name) => {
    const selectedVersion = name === productImProvider.name ? productImProvider.version : version;
    const filename = `${name.replace(/^@/, '').replace('/', '-')}-${selectedVersion}.tgz`;
    const bytes = Buffer.from(`artifact-check-fixture:${name}:${selectedVersion}`);
    writeFileSync(join(root, filename), bytes);
    return {
      name,
      version: selectedVersion,
      filename,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    };
  });
  writeFileSync(
    join(root, 'artifacts.json'),
    JSON.stringify({
      productVersion: version,
      dsh: productDsh,
      providerRuntime: { runtimeFiles: 1, runtimeSha256: 'a'.repeat(64) },
      artifacts,
    }),
  );
  return { root, artifacts };
}

describe('packaged product selection', () => {
  it('installs one product Bundle from verified artifacts without a developer Provider or workspace links', () => {
    const { root } = artifactSet();
    const saved = {
      dependencies: { other: '1.0.0' },
      dsh: {
        profile: {
          bundles: ['@deepseek-ai/dsh-base', 'other'],
          custom: true,
        },
      },
    };
    const result = packagedProfileManifest(saved, root);
    expect(result.dependencies).toEqual({
      other: '1.0.0',
      deepseekbot: expect.stringMatching(/^file:.*\.tgz$/),
    });
    expect(result.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'deepseekbot',
      'other',
    ]);
    expect(result.dsh.profile.custom).toBe(true);
    expect(JSON.stringify(result)).not.toContain('link:');
    expect(JSON.stringify(result)).not.toContain('github:');
    expect(saved.dependencies).toEqual({ other: '1.0.0' });
  });

  it.each(['@xmanrui/dsh-im', productImProvider.name])(
    'refuses a conflicting standalone %s before overwriting existing configuration',
    (name) => {
      const saved = { dsh: { profile: { bundles: [name] } }, untouched: 'retain' };
      expect(() => packagedProfileManifest(saved, '/not-needed')).toThrow(
        /remove its Bundle entry, retain credentials\/history/,
      );
      expect(saved).toEqual({ dsh: { profile: { bundles: [name] } }, untouched: 'retain' });
    },
  );

  it('migrates standalone owned members into the umbrella while retaining data', () => {
    const { root } = artifactSet();
    const saved = {
      dependencies: { other: '1.0.0' },
      preferences: { retained: true },
      dsh: {
        profile: {
          bundles: [
            '@deepseek-ai/dsh-base',
            '@botharness/browser',
            '@botharness/computer',
            '@botharness/core',
            '@botharness/ui',
            'other',
          ],
        },
      },
    };
    const result = packagedProfileManifest(saved, root);
    expect(result.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      'deepseekbot',
      'other',
    ]);
    expect(result.dependencies.other).toBe('1.0.0');
    expect(result.preferences).toEqual({ retained: true });
    expect(saved.dsh.profile.bundles).toContain('@botharness/browser');
  });

  it('refuses changed tarballs instead of installing an artifact with stale qualification', () => {
    const { root, artifacts } = artifactSet();
    writeFileSync(join(root, artifacts[0].filename), 'different package bytes');
    expect(() => verifiedProductArtifacts(root)).toThrow('Product artifact changed');
  });

  it('places artifact substitution and workspace build policy in pnpm 12 settings while preserving unrelated entries', () => {
    const { root } = artifactSet();
    const source =
      '# owned Profile\npackages: [.]\nautoInstallPeers: false\nallowBuilds:\n  reviewed: true\n  other: false\n  agent-browser: true\noverrides:\n  unrelated: 1.0.0\n';
    const result = packagedWorkspaceSettings(source, root);
    expect(result).toContain('# owned Profile');
    const settings = parse(result);
    expect(settings).toMatchObject({
      autoInstallPeers: false,
      allowBuilds: { reviewed: true, other: false },
      overrides: { unrelated: '1.0.0' },
    });
    expect(settings.allowBuilds['agent-browser']).toBe(true);
    expect(settings.allowBuilds['esbuild']).toBe(true);
    expect(settings.allowBuilds['protobufjs']).toBe(false);
    expect(packagedWorkspaceSettings('packages: [.]\n', root)).toContain('agent-browser: false');
    expect(
      parse(result).overrides[`${productImProvider.name}@${productImProvider.version}`],
    ).toMatch(/^file:.*\.tgz$/);
    expect(() => packagedWorkspaceSettings('packages: [', root)).toThrow(
      'invalid Profile workspace settings',
    );
  });

  it('keeps the packaged build policy in lockstep with the workspace root', () => {
    const workspace = parse(
      readFileSync(new URL('../../pnpm-workspace.yaml', import.meta.url), 'utf8'),
    );
    expect(productAllowBuilds).toEqual(workspace.allowBuilds);
  });

  it('refuses duplicate, missing, mismatched-version or escaping artifact entries', () => {
    const { root, artifacts } = artifactSet();
    for (const invalid of [
      artifacts.slice(1),
      [artifacts[0], artifacts[0], ...artifacts.slice(2)],
      [{ ...artifacts[0], filename: '../escape.tgz' }, ...artifacts.slice(1)],
      [{ ...artifacts[0], version: '9.0.0' }, ...artifacts.slice(1)],
    ]) {
      writeFileSync(
        join(root, 'artifacts.json'),
        JSON.stringify({ productVersion: '0.0.0-test.823', dsh: productDsh, artifacts: invalid }),
      );
      expect(() => verifiedProductArtifacts(root)).toThrow();
    }
  });

  it('changes the local product artifact for an upgrade while retaining unrelated preferences', () => {
    const first = artifactSet();
    const second = artifactSet('0.0.0-test.823.1');
    const saved = packagedProfileManifest({ preferences: { retained: true } }, first.root);
    const upgraded = packagedProfileManifest(saved, second.root);
    expect(upgraded.preferences).toEqual({ retained: true });
    expect(upgraded.dependencies.deepseekbot).toContain(second.root);
    expect(upgraded.dsh.profile.bundles.filter((name) => name === 'deepseekbot')).toHaveLength(1);
  });
});

describe('release composition', () => {
  it('ships the PersonaBot agent preset and selects it in both umbrella patches', () => {
    for (const patch of ['cordis.patch.yml', 'cordis.im.patch.yml']) {
      const rows = parse(
        readFileSync(new URL(`../../packages/deepseekbot/${patch}`, import.meta.url), 'utf8'),
      ).flatMap((row) => row.insert);
      expect(rows.find((row) => row.id === 'botharness-core')).toMatchObject({
        config: { agentPreset: 'deepseekbot' },
      });
      const preset = rows.find((row) => row.id === 'preset-deepseekbot');
      expect(preset).toMatchObject({
        name: '@deepseek-ai/dsh-agent-preset',
        config: { id: 'deepseekbot' },
      });
      expect(preset.config.plugins.find((row) => row.id === 'tool-ask-user')).toMatchObject({
        config: { mode: 'timed', timeout: 45 },
      });
    }
  });

  it('ships headless Browser by default in both umbrella patches', () => {
    for (const patch of ['cordis.patch.yml', 'cordis.im.patch.yml']) {
      const rows = parse(
        readFileSync(new URL(`../../packages/deepseekbot/${patch}`, import.meta.url), 'utf8'),
      ).flatMap((row) => row.insert);
      expect(rows.find((row) => row.id === 'botharness-browser')).toMatchObject({
        name: '@botharness/browser',
        config: { headless: true },
      });
    }
  });
  it('declares no Bundle for umbrella members, so the Plugins page cannot add them twice', () => {
    for (const member of ['browser', 'computer', 'core', 'client']) {
      const manifest = JSON.parse(
        readFileSync(new URL(`../../packages/${member}/package.json`, import.meta.url), 'utf8'),
      );
      expect(manifest.dsh?.bundle).toBeUndefined();
      expect(manifest.files).not.toContain('cordis.patch.yml');
    }
  });
  it('refuses duplicates in a composed native Patch before a receiver can start', () => {
    const entries = [
      { id: 'xmanrui-dsh-im', name: productImProvider.name },
      { id: 'botharness-core', name: '@botharness/core' },
      { id: 'botharness-client', name: '@botharness/ui' },
      { id: 'botharness-browser', name: '@botharness/browser' },
      { id: 'botharness-computer', name: '@botharness/computer' },
    ];
    expect(() => verifyProductComposition(entries)).not.toThrow();
    expect(() =>
      verifyProductComposition([...entries, { name: 'group', config: [entries[0]] }]),
    ).toThrow('conflicts');
    expect(() =>
      verifyProductComposition([...entries, { id: 'legacy', name: '@xmanrui/dsh-im' }]),
    ).toThrow('Standalone upstream');
    expect(() => verifyProductComposition(entries.slice(1))).toThrow('all five');
    expect(() =>
      verifyProductComposition([{ ...entries[0], disabled: true }, ...entries.slice(1)]),
    ).toThrow('conflicts');
  });
  it('reads native JS tags as data and refuses dynamic component disabling without evaluating code', () => {
    const entries = parseProductComposition(
      "- id: unrelated\n  name: native\n  disabled: !!js 'throw new Error(\"must not execute\")'\n- id: xmanrui-dsh-im\n  name: '@botharness/im-provider'\n- id: botharness-core\n  name: '@botharness/core'\n- id: botharness-client\n  name: '@botharness/ui'\n- id: botharness-browser\n  name: '@botharness/browser'\n- id: botharness-computer\n  name: '@botharness/computer'\n",
    );
    expect(entries[0].disabled.__jsExpr).toContain('must not execute');
    expect(() => verifyProductComposition(entries)).not.toThrow();
    entries[1].disabled = entries[0].disabled;
    expect(() => verifyProductComposition(entries)).toThrow('conflicts');
  });
  it('keeps product provenance independent when the development Provider selection changes', () => {
    expect(productImProvider.upstream.source).toBe('beaed4a6dabb583654d28fb09298716267039b4a');
    expect(productImProvider.upstream.dsh).toBe('0.2.0-rc.2');
  });

  it('pins independently named Provider and release packages in the product artifact', () => {
    const source = JSON.parse(
      readFileSync(new URL('../../packages/deepseekbot/package.json', import.meta.url), 'utf8'),
    );
    const release = productManifest(source, '0.0.0-test.823');
    expect(release.private).toBeUndefined();
    expect(release.dependencies).toEqual({
      '@botharness/browser': '0.0.0-test.823',
      '@botharness/computer': '0.0.0-test.823',
      '@botharness/core': '0.0.0-test.823',
      '@botharness/ui': '0.0.0-test.823',
      '@botharness/im-provider': '4.32.0-botharness.21',
    });
    expect(release.dsh.bundle.patch).toBe('./cordis.im.patch.yml');
    expect(release.bin).toEqual({
      'botharness-profile': './dist/profile-cli.mjs',
      deepseekbot: './dist/deepseekbot.mjs',
    });
    expect(release.files).toContain('dist');
    expect(source.private).toBe(true);
  });

  it('names the publishing repository in every manifest so npm accepts its provenance', () => {
    const provider = providerManifest({
      name: '@xmanrui/dsh-im',
      repository: { type: 'git', url: 'git+https://github.com/DoodleBears/dsh-im.git' },
      scripts: { build: 'x' },
    });
    const release = productManifest({}, '0.0.0-test.823');
    for (const manifest of [provider, release]) {
      expect(manifest.repository.url).toBe('git+https://github.com/BotHarness/BotHarness.git');
    }
    expect(provider.scripts).toBeUndefined();
  });

  it.each(['latest', '01.0.0', '', '1.0', 'v1.0.0'])(
    'rejects a nonexact release version %s',
    (version) => {
      expect(() => productManifest({}, version)).toThrow('explicit product SemVer');
    },
  );
});

describe('product-managed Provider updates', () => {
  it('reports the running artifact without starting any independent check or installation job', () => {
    expect(productManagedUpdate('update.status', {}, undefined, '4.32.0-botharness.3')).toEqual({
      ok: true,
      value: {
        runningVersion: '4.32.0-botharness.3',
        installedVersion: '4.32.0-botharness.3',
        latestVersion: null,
        canInstall: false,
        sourceInstall: false,
        blockedReason: 'product-managed',
        profileName: null,
        environmentKind: 'product',
        checkedAt: null,
        checkId: null,
        job: null,
      },
    });
  });
  it.each([
    ['update.check', {}],
    ['update.install', { checkId: 'old', requestId: 'test' }],
    ['update.status', { registry: 'https://unreviewed.invalid' }],
    ['unknown', {}],
    ['update.status', null],
    ['update.status', []],
  ])(
    'refuses %s so upstream update paths cannot replace the qualified artifact',
    (endpoint, payload) => {
      expect(
        productManagedUpdate(endpoint, payload, undefined, '4.32.0-botharness.3'),
      ).toMatchObject({ ok: false, error: { code: 'product-managed' } });
    },
  );
  it('retains cancellation without running an update', () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      productManagedUpdate('update.status', {}, controller.signal, '4.32.0-botharness.3'),
    ).toMatchObject({ ok: false, error: { code: 'cancelled' } });
  });
});
