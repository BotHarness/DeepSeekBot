#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseReleaseLedger,
  validateDshSkillReleaseLedgerPair,
  validateReleaseLedgerPair,
} from './release-ledger.mjs';
import { readSkillProvenance } from './sync-skill.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = {
  deepseekbot: {
    name: 'DeepSeekBot',
    repository: 'BotHarness/BotHarness',
    ledgerEn: resolve(ROOT, 'CHANGELOG.md'),
    ledgerZh: resolve(ROOT, 'CHANGELOG.zh.md'),
  },
  'dsh-skill': {
    name: 'DSH Skill',
    repository: 'BotHarness/dsh-skill',
    ledgerEn: resolve(ROOT, '.agents/skills/dsh-plugin-dev/CHANGELOG.md'),
    ledgerZh: resolve(ROOT, '.agents/skills/dsh-plugin-dev/CHANGELOG.zh.md'),
  },
};

function fail(message) {
  throw new Error(message);
}

function cleanList(values, label) {
  const result = [];
  for (const value of values ?? []) {
    const clean = value.trim();
    if (!clean) fail(`${label} cannot be empty.`);
    if (!result.includes(clean)) result.push(clean);
  }
  return result;
}

function prereleaseChannel(version) {
  const withoutBuild = version.split('+', 1)[0];
  const separator = withoutBuild.indexOf('-');
  if (separator === -1) return undefined;
  return withoutBuild
    .slice(separator + 1)
    .split('.', 1)[0]
    .toLowerCase();
}

function validateLedgers(artifact, english, chinese, currentSkillProvenance) {
  if (typeof english !== 'string' || typeof chinese !== 'string') {
    fail('canonical English and Chinese ledgers are required.');
  }
  const errors =
    artifact === 'dsh-skill'
      ? validateDshSkillReleaseLedgerPair(english, chinese, currentSkillProvenance)
      : validateReleaseLedgerPair(english, chinese);
  if (errors.length > 0) {
    const first = errors[0];
    fail(`canonical bilingual ledger is invalid (${first.code}).`);
  }
}

function parseCoreVersion(version) {
  const [core] = version.split(/[+-]/, 1);
  const parts = core.split('.').map(Number);
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

function documentationReleaseKind(releases, release) {
  if (
    release.sections.length === 0 ||
    !release.sections.every(({ name }) => name === 'Documentation')
  ) {
    return undefined;
  }
  if (prereleaseChannel(release.identity)) return 'release';
  const index = releases.indexOf(release);
  const currentVersion = parseCoreVersion(release.identity);
  const previous = releases
    .slice(index + 1)
    .filter(({ identity }) => /^\d+\.\d+\.\d+$/.test(identity))
    .find(({ identity }) => {
      const candidate = parseCoreVersion(identity);
      return candidate.major === currentVersion.major && candidate.minor === currentVersion.minor;
    });
  if (!previous) return 'release';
  const previousVersion = parseCoreVersion(previous.identity);
  return currentVersion.patch > previousVersion.patch ? 'patch' : 'release';
}

function releaseBody(release, artifact, metadata) {
  const parts = [];

  if (artifact === 'deepseekbot') {
    const releaseUrl = `https://deepseekbot.app/r/v${release.identity}`;
    parts.push(
      `- **官网 / Website:** [DeepSeekBot](${releaseUrl})\n` +
        `- **安装教程 / Installation:** [中文](${releaseUrl}/install) · [English](${releaseUrl}/install/en)\n` +
        `- **精确安装版本 / Exact install spec:** \`deepseekbot@${release.identity}\``,
    );
  }

  parts.push(release.summary);

  if (artifact === 'deepseekbot' && metadata.documentationReleaseKind) {
    const label = metadata.documentationReleaseKind === 'patch' ? 'patch' : 'release';
    parts.push(`> Documentation-only ${label}: runtime behavior is unchanged.`);
  }

  if (artifact === 'dsh-skill') {
    const provenance = release.provenance;
    parts.push(
      `- **Skill version:** \`${provenance.skillVersion}\`\n` +
        `- **Verified against DSH:** \`${provenance.verifiedAgainst}\`\n` +
        `- **Upstream revision:** [\`${provenance.upstreamSha}\`](${provenance.upstreamUrl})`,
    );
  }

  if (metadata.highlights.length > 0) {
    parts.push(`## Highlights\n\n${metadata.highlights.map((item) => `- ${item}`).join('\n')}`);
  }

  for (const section of release.sections) {
    parts.push(
      `## ${section.name}\n\n${section.entries.map(({ text }) => `- ${text}`).join('\n')}`,
    );
  }

  if (metadata.contributors.length > 0) {
    parts.push(
      `## Contributors\n\n${metadata.contributors.map((person) => `- ${person}`).join('\n')}`,
    );
  }
  if (metadata.newContributors.length > 0) {
    parts.push(
      `### New contributors\n\n${metadata.newContributors
        .map((person) => `- ${person} made their first contribution`)
        .join('\n')}`,
    );
  }
  if (metadata.comparisonUrl) {
    parts.push(`**Full comparison:** [View all changes](${metadata.comparisonUrl})`);
  }

  return `${parts.join('\n\n')}\n`;
}

function validateComparisonUrl(artifact, version, value, previousVersion) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('full comparison URL must be an HTTPS GitHub comparison for this artifact and tag.');
  }
  const prefix = `/${artifact.repository}/compare/`;
  const comparison = url.pathname.slice(prefix.length);
  if (
    url.origin !== 'https://github.com' ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(prefix) ||
    !/^[^/]+\.\.\.v[0-9A-Za-z.+-]+$/.test(comparison) ||
    !comparison.endsWith(`...v${version}`) ||
    (previousVersion && comparison !== `v${previousVersion}...v${version}`)
  ) {
    fail('full comparison URL must be an HTTPS GitHub comparison for this artifact and tag.');
  }
  return url.href;
}

export function prepareReleaseDraft(input) {
  const artifact = ARTIFACTS[input.artifact];
  if (!artifact) fail('artifact must be deepseekbot or dsh-skill.');
  if (!input.version) fail('version is required.');
  if (!input.tag) fail('tag is required.');
  if (!input.githubReleaseVersion) fail('GitHub Release version is required.');
  if (!input.installableVersion) fail('installable artifact version is required.');
  if (!input.comparisonUrl?.trim()) fail('full comparison URL is required.');

  if (
    input.artifact === 'dsh-skill' &&
    input.currentSkillProvenance?.skillVersion !== input.version
  ) {
    fail('DSH Skill version must match current SKILL.md metadata.');
  }
  validateLedgers(
    input.artifact,
    input.englishLedger,
    input.chineseLedger,
    input.currentSkillProvenance,
  );
  const releases = parseReleaseLedger(input.englishLedger).releases;
  const release = releases.find(({ identity, date }) => identity === input.version && date);
  if (!release) fail('version is not a dated release in the canonical ledger.');
  const releaseIndex = releases.indexOf(release);
  const previousRelease = releases
    .slice(releaseIndex + 1)
    .find(({ identity, date }) => date && identity !== 'Development');
  const comparisonUrl = validateComparisonUrl(
    artifact,
    input.version,
    input.comparisonUrl.trim(),
    previousRelease?.identity,
  );

  const expectedTag = `v${input.version}`;
  if (input.tag !== expectedTag) fail(`tag must be ${expectedTag}.`);
  if (input.githubReleaseVersion !== input.version) {
    fail(`GitHub Release version must be ${input.version}.`);
  }
  if (input.installableVersion !== input.version) {
    fail(`installable artifact version must be ${input.version}.`);
  }

  const channel = prereleaseChannel(input.version);
  if (channel && !['alpha', 'beta', 'rc'].includes(channel)) {
    fail('prerelease channel must be alpha, beta, or rc.');
  }
  if (channel && (!input.tagged || !input.installable)) {
    fail('prerelease needs positive tagged and installable evidence.');
  }
  const documentationKind =
    input.artifact === 'deepseekbot' ? documentationReleaseKind(releases, release) : undefined;

  const highlights = cleanList(input.highlights, 'highlight');
  if (highlights.length > 3) fail('release drafts accept at most three highlights.');
  const metadata = {
    highlights,
    contributors: cleanList(input.contributors, 'contributor'),
    newContributors: cleanList(input.newContributors, 'new contributor'),
    comparisonUrl,
    documentationReleaseKind: documentationKind,
  };

  return {
    artifact: artifact.name,
    version: input.version,
    tagName: input.tag,
    installableVersion: input.installableVersion,
    name: `${artifact.name} v${input.version}`,
    prerelease: channel !== undefined,
    releasePlan: {
      canonicalVersion: input.version,
      tagName: input.tag,
      githubReleaseVersion: input.githubReleaseVersion,
      installableArtifactVersion: input.installableVersion,
      tagged: input.tagged ?? false,
      installable: input.installable ?? false,
    },
    body: releaseBody(release, input.artifact, metadata),
  };
}

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) fail(`${option} needs a value.`);
  return value;
}

function parseArgs(argv) {
  const options = { highlights: [], contributors: [], newContributors: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--artifact') options.artifact = takeValue(argv, index++, option);
    else if (option === '--version') options.version = takeValue(argv, index++, option);
    else if (option === '--tag') options.tag = takeValue(argv, index++, option);
    else if (option === '--github-release-version') {
      options.githubReleaseVersion = takeValue(argv, index++, option);
    } else if (option === '--installable-version') {
      options.installableVersion = takeValue(argv, index++, option);
    } else if (option === '--tagged') options.tagged = true;
    else if (option === '--installable') options.installable = true;
    else if (option === '--highlight') options.highlights.push(takeValue(argv, index++, option));
    else if (option === '--contributor') {
      options.contributors.push(takeValue(argv, index++, option));
    } else if (option === '--new-contributor') {
      options.newContributors.push(takeValue(argv, index++, option));
    } else if (option === '--comparison-url') {
      options.comparisonUrl = takeValue(argv, index++, option);
    } else fail(`unknown option ${option}.`);
  }
  return options;
}

function readLedger(path, language) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read the canonical ${language} ledger.`);
  }
}

function run(argv) {
  const options = parseArgs(argv);
  if (!options.artifact) fail('--artifact is required.');
  if (!options.version) fail('--version is required.');
  if (!options.tag) fail('--tag is required.');
  if (!options.githubReleaseVersion) fail('--github-release-version is required.');
  if (!options.installableVersion) fail('--installable-version is required.');
  if (!options.comparisonUrl) fail('--comparison-url is required.');
  const artifact = ARTIFACTS[options.artifact];
  if (!artifact) fail('--artifact must be deepseekbot or dsh-skill.');

  const draft = prepareReleaseDraft({
    ...options,
    englishLedger: readLedger(artifact.ledgerEn, 'English'),
    chineseLedger: readLedger(artifact.ledgerZh, 'Chinese'),
    ...(options.artifact === 'dsh-skill' ? { currentSkillProvenance: readSkillProvenance() } : {}),
  });
  process.stdout.write(`${JSON.stringify(draft, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error.';
    process.stderr.write(`Release draft preparation failed: ${message}\n`);
    process.exitCode = 1;
  }
}
