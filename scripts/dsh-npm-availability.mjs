#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import semver from 'semver';

const registry = 'https://registry.npmjs.org';
const packages = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-client-ui-theme'];

async function inspect(name, version, fetchImpl) {
  const packageUrl = `${registry}/${encodeURIComponent(name)}`;
  const result = { name, version, url: `${packageUrl}/${version}` };
  const request = (url) =>
    fetchImpl(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  try {
    const response = await request(result.url);
    result.status = response.status;
    if (response.status === 200) {
      const manifest = await response.json();
      return {
        ...result,
        state:
          manifest?.name === name && manifest?.version === version
            ? 'available'
            : 'metadata-inconsistent',
      };
    }
    if (response.status !== 404) return { ...result, state: 'lookup-failed' };
    const metadata = await request(packageUrl);
    result.packageStatus = metadata.status;
    if (metadata.status === 404) return { ...result, state: 'package-unavailable' };
    if (metadata.status !== 200) return { ...result, state: 'lookup-failed' };
    const document = await metadata.json();
    if (
      document?.name !== name ||
      !document.versions ||
      typeof document.versions !== 'object' ||
      Array.isArray(document.versions) ||
      Object.hasOwn(document.versions, version)
    )
      return { ...result, state: 'metadata-inconsistent' };
    result.tags = Object.fromEntries(
      ['latest', 'next', 'alpha'].flatMap((tag) => {
        const value = document['dist-tags']?.[tag];
        return typeof value === 'string' && semver.valid(value) ? [[tag, value]] : [];
      }),
    );
    return { ...result, state: 'version-unavailable' };
  } catch {
    return { ...result, state: 'lookup-failed' };
  }
}

export async function checkDshNpmAvailability(version, fetchImpl = fetch) {
  if (typeof version !== 'string' || semver.valid(version) !== version)
    throw new Error('An exact SemVer is required; tags and ranges are not accepted');
  const results = await Promise.all(packages.map((name) => inspect(name, version, fetchImpl)));
  return {
    checkedAt: new Date().toISOString(),
    registry,
    version,
    scope: 'npm-metadata-only',
    ok: results.every((result) => result.state === 'available'),
    packages: results,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Usage: node scripts/dsh-npm-availability.mjs <exact-version>');
    const report = await checkDshNpmAvailability(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
