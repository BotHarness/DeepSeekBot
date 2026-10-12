import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const qualifiedImProvider = Object.freeze({
  package: '@xmanrui/dsh-im',
  packageVersion: '4.32.0',
  source: '602baa37fa327f7069545aaadbbd34db8a8f4636',
  spec: 'github:DoodleBears/dsh-im#602baa37fa327f7069545aaadbbd34db8a8f4636',
  dsh: '0.2.0-rc.1',
  runtimeFiles: 412,
  runtimeSha256: '98ba54de21ff7b73390b6222d67ab530efd36e1a26df952be178e3bafc4ab9e5',
});

export function withQualifiedImProvider(manifest) {
  return {
    ...manifest,
    dependencies: {
      ...manifest.dependencies,
      [qualifiedImProvider.package]: qualifiedImProvider.spec,
    },
    dsh: {
      ...manifest.dsh,
      profile: {
        ...manifest.dsh?.profile,
        bundles: [
          ...new Set([...(manifest.dsh?.profile?.bundles ?? []), qualifiedImProvider.package]),
        ],
      },
    },
  };
}

export function providerRuntimeDigest(root) {
  const paths = [];
  const visit = (directory) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error('IM provider runtime contains an unexpected symbolic link');
    }
  };
  for (const directory of ['lib', 'plugin-src', 'src']) visit(directory);
  paths.push('cordis.patch.yml');
  const hash = createHash('sha256');
  for (const path of paths.sort()) {
    hash.update(`${path}\0`);
    hash.update(
      `${createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex')}\n`,
    );
  }
  return { runtimeFiles: paths.length, runtimeSha256: hash.digest('hex') };
}

export function verifyQualifiedImProvider(profileDirectory, pin = qualifiedImProvider) {
  const manifest = JSON.parse(readFileSync(join(profileDirectory, 'package.json'), 'utf8'));
  if (
    manifest.dependencies?.[pin.package] !== pin.spec ||
    !manifest.dsh?.profile?.bundles?.includes(pin.package)
  )
    throw new Error('IM provider Profile does not select the qualified source and Bundle');
  const root = join(profileDirectory, 'node_modules', ...pin.package.split('/'));
  const installed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (
    installed.name !== pin.package ||
    installed.version !== pin.packageVersion ||
    installed.main !== './lib/index.js' ||
    installed.dsh?.bundle?.patch !== './cordis.patch.yml'
  )
    throw new Error('IM provider package metadata differs from the qualified artifact');
  const runtime = providerRuntimeDigest(root);
  if (runtime.runtimeFiles !== pin.runtimeFiles || runtime.runtimeSha256 !== pin.runtimeSha256)
    throw new Error('IM provider runtime differs from the qualified source; refusing to boot');
  return { source: pin.source, dsh: pin.dsh, ...runtime, upstreamReleased: false };
}
