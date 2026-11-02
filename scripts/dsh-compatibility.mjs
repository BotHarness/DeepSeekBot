import semver from 'semver';

export const productDshRange = '>=0.2.0-0';
export function assertDshVersion(version) {
  if (!semver.satisfies(version, productDshRange, { includePrerelease: true }))
    throw new Error(`DSH ${version} does not meet the API floor ${productDshRange}`);
  return version;
}
