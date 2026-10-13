import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, it, vi } from 'vitest';
import {
  providerReleasePlan,
  verifyProviderArchive,
  publishQualifiedProvider,
} from '../npm-provider-release.mjs';

function fixture() {
  const bytes = Buffer.from('qualified Provider fixture');
  const plan = {
    ...providerReleasePlan,
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
  };
  const archive = {
    bytes,
    manifest: {
      name: plan.name,
      version: plan.version,
      license: 'MIT',
      botharness: { managedByProduct: true },
    },
    provenance: {
      source: plan.providerSource,
      compiledOutput: { runtimeFiles: plan.runtimeFiles, runtimeSha256: plan.runtimeSha256 },
    },
  };
  const remote = {
    name: plan.name,
    version: plan.version,
    dist: { integrity: plan.integrity, tarball: 'https://registry.npmjs.org/qualified.tgz' },
  };
  const publish = vi.fn(async () => {});
  const input = {
    archive,
    plan,
    readVersion: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(remote),
    publish,
    download: vi.fn(async () => bytes),
    readTags: async () => ({ next: plan.version, latest: '4.32.0-botharness.16' }),
    sleep: vi.fn(async () => {}),
  };
  return { archive, plan, remote, input, publish };
}

it('refuses a substituted archive before any registry or publication action', async () => {
  const fx = fixture();
  fx.archive.bytes = Buffer.from('substituted');
  await expect(publishQualifiedProvider(fx.input)).rejects.toThrow('qualified bytes');
  expect(fx.input.readVersion).not.toHaveBeenCalled();
  expect(fx.publish).not.toHaveBeenCalled();
});

it.each(['identity', 'source', 'runtime', 'tag'])(
  'rejects a conflicting reviewed %s before publication',
  (kind) => {
    const { archive, plan } = fixture();
    if (kind === 'identity') archive.manifest.name = 'deepseekbot';
    if (kind === 'source') archive.provenance.source = 'b'.repeat(40);
    if (kind === 'runtime') archive.provenance.compiledOutput.runtimeSha256 = 'b'.repeat(64);
    if (kind === 'tag') plan.distTag = 'latest';
    expect(() => verifyProviderArchive(archive, plan)).toThrow('reviewed plan');
  },
);

it('publishes once and verifies both registry metadata and downloaded bytes', async () => {
  const fx = fixture();
  expect(await publishQualifiedProvider(fx.input)).toMatchObject({
    version: fx.plan.version,
    attempted: true,
    archiveVerified: true,
    latest: '4.32.0-botharness.16',
  });
  expect(fx.publish).toHaveBeenCalledTimes(1);
  expect(fx.input.download).toHaveBeenCalledWith(fx.remote.dist.tarball);
});

it('never overwrites a registry version with conflicting bytes', async () => {
  const fx = fixture();
  fx.input.readVersion = vi.fn(async () => ({
    ...fx.remote,
    dist: { ...fx.remote.dist, integrity: 'sha512-other' },
  }));
  await expect(publishQualifiedProvider(fx.input)).rejects.toThrow('different Provider bytes');
  expect(fx.publish).not.toHaveBeenCalled();
});

it('verifies an already published exact archive without publishing it again', async () => {
  const fx = fixture();
  fx.input.readVersion = vi.fn(async () => fx.remote);
  expect(await publishQualifiedProvider(fx.input)).toMatchObject({
    attempted: false,
    archiveVerified: true,
  });
  expect(fx.publish).not.toHaveBeenCalled();
});

it('a failed response with observed matching registry bytes is not resent', async () => {
  const fx = fixture();
  fx.input.publish = vi.fn(async () => {
    throw new Error('response lost');
  });
  expect(await publishQualifiedProvider(fx.input)).toMatchObject({
    publicationErrorObserved: true,
  });
  expect(fx.input.publish).toHaveBeenCalledTimes(1);
});

it('an unobserved publication stops after readbacks without automatically publishing again', async () => {
  const fx = fixture();
  fx.input.readVersion = vi.fn(async () => undefined);
  await expect(publishQualifiedProvider(fx.input)).rejects.toThrow('inspect registry state');
  expect(fx.publish).toHaveBeenCalledTimes(1);
});

it('rejects differing downloaded bytes even when registry integrity claims acceptance', async () => {
  const fx = fixture();
  fx.input.download = vi.fn(async () => Buffer.from('different archive'));
  await expect(publishQualifiedProvider(fx.input)).rejects.toThrow('Downloaded registry archive');
});

it('does not claim completion when next points elsewhere', async () => {
  const fx = fixture();
  fx.input.readTags = async () => ({ next: '4.32.0-botharness.21' });
  await expect(publishQualifiedProvider(fx.input)).rejects.toThrow('next tag');
});

it('retains the existing publication environment and serializes with product releases', () => {
  const workflow = parse(
    readFileSync(
      new URL('../../.github/workflows/im-provider-release.yml', import.meta.url),
      'utf8',
    ),
  );
  const product = parse(
    readFileSync(new URL('../../.github/workflows/npm-release.yml', import.meta.url), 'utf8'),
  );
  expect(workflow.jobs.publish.environment).toBe(product.jobs.publish.environment);
  expect(workflow.concurrency).toEqual(product.concurrency);
  expect(workflow.on.push.tags).toEqual(['v-im-provider-*']);
  expect(product.on.push.tags).toEqual(['v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-*']);
  expect(JSON.stringify(workflow.jobs.prepare)).not.toContain('secrets.NPM_TOKEN');
  const credentialSteps = workflow.jobs.publish.steps.filter((step) => step.env?.NPM_TOKEN);
  expect(credentialSteps).toHaveLength(1);
  expect(credentialSteps[0].env.NPM_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
});
