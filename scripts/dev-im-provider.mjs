import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const qualifiedImProvider = Object.freeze({
  package: '@xmanrui/dsh-im',
  packageVersion: '4.32.0',
  source: 'beaed4a6dabb583654d28fb09298716267039b4a',
  spec: 'github:DoodleBears/dsh-im#beaed4a6dabb583654d28fb09298716267039b4a',
  dsh: '0.2.1-rc.2',
  runtimeFiles: 421,
  runtimeSha256: '42e1140e67ba2f74122db3d49bb2c8aece239b7d75f9564ce713a8a491902706',
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
