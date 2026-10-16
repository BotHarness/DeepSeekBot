import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { verifiedProductArtifacts } from './packaged-profile.mjs';

const CHECKS = [
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
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (value, size) =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const text = (value) => typeof value === 'string' && value.trim() !== '';
const url = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
};

function identities(record) {
  const { mobile, computer } = record ?? {};
  if (record?.schemaVersion !== 1 || !mobile || !computer)
    throw new Error('Invalid release record schema');
  if (
    !['ios', 'android'].includes(mobile.platform) ||
    mobile.appId !== 'app.deepseekbot.mobile' ||
    !semver.valid(mobile.version) ||
    !/^[1-9]\d*$/.test(mobile.buildNumber) ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(mobile.buildId) ||
    !digest(mobile.source, 40) ||
    !digest(mobile.sha256, 64) ||
    !url(mobile.installUrl)
  )
    throw new Error('Invalid mobile release identity');
  if (
    computer.format !== 'npm' ||
    !['darwin', 'win32', 'linux'].includes(computer.platform) ||
    !['arm64', 'x64'].includes(computer.arch) ||
    !semver.valid(computer.version) ||
    !digest(computer.source, 40) ||
    !digest(computer.manifestSha256, 64) ||
    !url(computer.installUrl)
  )
    throw new Error('Invalid computer release identity');
  return {
    mobile: Object.fromEntries(
      ['platform', 'appId', 'version', 'buildNumber', 'buildId', 'source', 'sha256'].map((key) => [
        key,
        mobile[key],
      ]),
    ),
    computer: Object.fromEntries(
      ['format', 'platform', 'arch', 'version', 'source', 'manifestSha256'].map((key) => [
        key,
        computer[key],
      ]),
    ),
  };
}

export function releaseCombinationId(record) {
  return sha256(JSON.stringify(identities(record)));
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(value[key])]),
    );
  return value;
}

export function releaseApprovalDigest(record, check) {
  if (check !== 'human-qa' && check !== 'distribution-approval')
    throw new Error('Invalid approval scope');
  return sha256(
    JSON.stringify(
      ordered({
        identities: identities(record),
        mobileInstallUrl: record.mobile.installUrl,
        computerInstallUrl: record.computer.installUrl,
        evidence: record.evidence
          .filter(
            (entry) =>
              entry.check !== 'distribution-approval' &&
              (check === 'distribution-approval' || entry.check !== 'human-qa'),
          )
          .toSorted((left, right) => left.check.localeCompare(right.check)),
        baselines: record.baselines.toSorted((left, right) => left.kind.localeCompare(right.kind)),
      }),
    ),
  );
}

export function verifyReleaseCombination(record, { mobileFile, productDirectory }) {
  const id = releaseCombinationId(record);
  if (sha256(readFileSync(mobileFile)) !== record.mobile.sha256)
    throw new Error('Mobile artifact checksum mismatch');
  const product = verifiedProductArtifacts(productDirectory);
  if (
    product.productVersion !== record.computer.version ||
    sha256(readFileSync(join(productDirectory, 'artifacts.json'))) !==
      record.computer.manifestSha256
  )
    throw new Error('Computer artifact identity mismatch');
  const blockers = [];
  if (!Array.isArray(record.evidence) || !Array.isArray(record.baselines))
    throw new Error('Evidence and baselines must be arrays');
  const seen = new Set();
  for (const witness of record.evidence) {
    if (
      !CHECKS.includes(witness?.check) ||
      seen.has(witness.check) ||
      witness.combination !== id ||
      !url(witness.url) ||
      !text(witness.by) ||
      !Number.isFinite(Date.parse(witness.at)) ||
      !['passed', 'blocked'].includes(witness.status)
    )
      throw new Error('Invalid, duplicate or stale combination evidence');
    seen.add(witness.check);
    if (witness.status !== 'passed') blockers.push(`Blocked evidence: ${witness.check}`);
  }
  for (const check of CHECKS) if (!seen.has(check)) blockers.push(`Missing evidence: ${check}`);
  const qualificationTime = Math.max(
    0,
    ...record.evidence
      .filter((entry) => entry.check !== 'human-qa' && entry.check !== 'distribution-approval')
      .map((entry) => Date.parse(entry.at)),
  );
  const human = record.evidence.find((entry) => entry.check === 'human-qa');
  const approval = record.evidence.find((entry) => entry.check === 'distribution-approval');
  if (
    (human && Date.parse(human.at) < qualificationTime) ||
    (approval &&
      Date.parse(approval.at) < Math.max(qualificationTime, human ? Date.parse(human.at) : 0))
  )
    blockers.push('Human approval predates qualification evidence');
  const baselineKinds = new Set();
  for (const baseline of record.baselines) {
    if (
      !['stable', 'beta-1', 'beta-2'].includes(baseline?.kind) ||
      baselineKinds.has(baseline.kind) ||
      !['tested', 'blocked', 'not-established'].includes(baseline.status) ||
      !text(baseline.reason) ||
      !url(baseline.evidenceUrl) ||
      baseline.mobileSha256 !== record.mobile.sha256
    )
      throw new Error('Invalid or stale baseline record');
    baselineKinds.add(baseline.kind);
    if (baseline.status === 'tested' && !digest(baseline.combination, 64))
      throw new Error('Tested baseline needs an exact combination');
    if (baseline.status === 'blocked') blockers.push(`Blocked baseline: ${baseline.kind}`);
  }
  for (const kind of ['stable', 'beta-1', 'beta-2'])
    if (!baselineKinds.has(kind)) blockers.push(`Missing baseline disposition: ${kind}`);
  for (const approval of record.evidence.filter(
    (entry) => entry.check === 'human-qa' || entry.check === 'distribution-approval',
  ))
    if (approval.reviewedEvidence !== releaseApprovalDigest(record, approval.check))
      blockers.push(`Stale approval: ${approval.check}`);
  return {
    id,
    artifactChecksumsMatch: true,
    qualification: blockers.length ? 'blocked' : 'evidence-recorded',
    blockers,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, file, mobileFlag, mobileFile, computerFlag, productDirectory, ...extra] =
      process.argv.slice(2);
    if (mode === '--id' && file && !mobileFlag) {
      console.log(releaseCombinationId(JSON.parse(readFileSync(file, 'utf8'))));
    } else if (mode === '--approval-digests' && file && !mobileFlag) {
      const record = JSON.parse(readFileSync(file, 'utf8'));
      console.log(
        JSON.stringify(
          {
            'human-qa': releaseApprovalDigest(record, 'human-qa'),
            'distribution-approval': releaseApprovalDigest(record, 'distribution-approval'),
          },
          null,
          2,
        ),
      );
    } else if (
      mode === '--check' &&
      file &&
      mobileFlag === '--mobile-artifact' &&
      mobileFile &&
      computerFlag === '--computer-artifacts' &&
      productDirectory &&
      extra.length === 0
    ) {
      const result = verifyReleaseCombination(JSON.parse(readFileSync(file, 'utf8')), {
        mobileFile,
        productDirectory,
      });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.qualification === 'blocked' ? 2 : 0;
    } else {
      throw new Error(
        'Usage: release-combination.mjs --id record.json OR --approval-digests record.json OR --check record.json --mobile-artifact app.ipa --computer-artifacts packages-directory',
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
