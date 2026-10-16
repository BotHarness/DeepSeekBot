import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { productDsh, productImProvider } from '../product-artifacts.mjs';
import {
  verifyReleaseCombination,
  releaseCombinationId,
  releaseApprovalDigest,
} from '../release-combination.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'release-combination-'));
  roots.push(root);
  const artifacts = [
    'deepseekbot',
    '@botharness/core',
    '@botharness/ui',
    '@botharness/browser',
    '@botharness/computer',
    productImProvider.name,
  ].map((name, index) => {
    const filename = `package-${index}.tgz`;
    const bytes = Buffer.from(name);
    writeFileSync(join(root, filename), bytes);
    return {
      name,
      filename,
      version: name === productImProvider.name ? productImProvider.version : '2.0.0-beta.1',
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    };
  });
  writeFileSync(
    join(root, 'artifacts.json'),
    JSON.stringify({
      productVersion: '2.0.0-beta.1',
      dsh: productDsh,
      providerRuntime: { runtimeFiles: 1, runtimeSha256: 'a'.repeat(64) },
      artifacts,
    }),
  );
  writeFileSync(join(root, 'phone.ipa'), 'phone artifact');
  const record = {
    schemaVersion: 1,
    mobile: {
      platform: 'ios',
      appId: 'app.deepseekbot.mobile',
      version: '0.0.1',
      buildNumber: '4',
      buildId: 'a536bd0b-a6eb-4613-afe5-03a4c994d5a6',
      source: 'a'.repeat(40),
      sha256: hash('phone artifact'),
      installUrl: 'https://testflight.apple.com/join/example',
    },
    computer: {
      format: 'npm',
      platform: 'darwin',
      arch: 'arm64',
      version: '2.0.0-beta.1',
      source: 'b'.repeat(40),
      manifestSha256: hash(readFileSync(join(root, 'artifacts.json'))),
      installUrl: 'https://github.com/BotHarness/DeepSeekBot/releases/tag/v2.0.0-beta.1',
    },
    evidence: [],
    baselines: [],
  };
  return { record, files: { mobileFile: join(root, 'phone.ipa'), productDirectory: root } };
}

describe('exact Release Combination qualification', () => {
  it('binds all evidence to the exact pair and requires Human approval after the runtime evidence', () => {
    const { record, files } = fixture();
    const combination = releaseCombinationId(record);
    record.evidence = [
      'identity',
      'fresh-install',
      'upgrade',
      'pairing',
      'dm-reply',
      'reconnect',
      'notifications',
      'store-upload',
      'store-processing',
      'tester-eligibility',
      'store-install',
      'shared-binary-safety',
      'quota',
      'human-qa',
      'distribution-approval',
    ].map((check) => ({
      check,
      combination,
      status: 'passed',
      by: 'reviewer',
      at: '2026-10-16T10:00:00Z',
      url: 'https://github.com/BotHarness/DeepSeekBot/issues/1931#issuecomment-example',
    }));
    record.baselines = ['stable', 'beta-1', 'beta-2'].map((kind) => ({
      kind,
      status: 'not-established',
      reason: 'First mobile-capable baseline; registry audit attached.',
      evidenceUrl: 'https://github.com/BotHarness/DeepSeekBot/issues/1931',
      mobileSha256: record.mobile.sha256,
    }));
    const approve = () => {
      for (const check of ['human-qa', 'distribution-approval'])
        record.evidence.find((entry) => entry.check === check).reviewedEvidence =
          releaseApprovalDigest(record, check);
    };
    approve();
    expect(verifyReleaseCombination(record, files).qualification).toBe('evidence-recorded');
    record.evidence.find((entry) => entry.check === 'dm-reply').url =
      'https://github.com/BotHarness/DeepSeekBot/issues/1931#changed';
    expect(verifyReleaseCombination(record, files).blockers).toContain('Stale approval: human-qa');
    approve();
    record.baselines[0].reason = 'Changed baseline audit';
    expect(verifyReleaseCombination(record, files).blockers).toContain('Stale approval: human-qa');
    approve();
    record.mobile.installUrl = 'https://testflight.apple.com/join/changed';
    expect(verifyReleaseCombination(record, files).blockers).toContain(
      'Stale approval: distribution-approval',
    );
    record.evidence.find((entry) => entry.check === 'dm-reply').at = '2026-10-16T11:00:00Z';
    expect(verifyReleaseCombination(record, files).blockers).toContain(
      'Human approval predates qualification evidence',
    );
    record.mobile.source = 'c'.repeat(40);
    expect(() => verifyReleaseCombination(record, files)).toThrow('stale combination evidence');
  });

  it('checks actual phone bytes and the existing qualified npm set but cannot mistake a build for approval', () => {
    const { record, files } = fixture();
    const result = verifyReleaseCombination(record, files);
    expect(result.artifactChecksumsMatch).toBe(true);
    expect(result.qualification).toBe('blocked');
    expect(result.blockers).toContain('Missing evidence: human-qa');
    expect(result.blockers).toContain('Missing evidence: store-install');
    writeFileSync(files.mobileFile, 'changed phone artifact');
    expect(() => verifyReleaseCombination(record, files)).toThrow(
      'Mobile artifact checksum mismatch',
    );
  });
});
