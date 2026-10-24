import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packagedProfileManifest,
  packagedWorkspaceSettings,
  parseProductComposition,
  verifiedProductArtifacts,
  verifyPackagedProfile,
  verifyProductComposition,
} from './packaged-profile.mjs';
import { pnpmCommand } from './dev-package-manager.mjs';
import { assertDshVersion } from './dsh-compatibility.mjs';

export function installSourceProfile({ home, profile, artifacts, dsh = 'dsh' }) {
  home = resolve(home);
  artifacts = resolve(artifacts);
  if (
    !/^[A-Za-z0-9_-]+$/u.test(profile) ||
    ['web', 'desktop', 'headless', 'sdk', 'sdk-minimal', 'acp'].includes(profile)
  )
    throw new Error('Choose a new custom Profile name');
  verifiedProductArtifacts(artifacts);
  const directory = join(home, 'profiles', profile);
  if (existsSync(directory))
    throw new Error(
      'Profile already exists; inspect it and use its native update workflow instead of overwriting it',
    );
  const environment = { ...process.env, DSH_HOME: home };
  function run(command, args, cwd) {
    const result = spawnSync(command, args, {
      cwd,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stderr.write(result.stderr ?? '');
      throw new Error(`Installation step failed: ${command} (exit ${result.status})`);
    }
    return result.stdout;
  }
  const dshVersion = assertDshVersion(run(dsh, ['--version']).trim());
  const [pnpm, pnpmVersionArgs] = pnpmCommand(['--version']);
  if (run(pnpm, pnpmVersionArgs).trim() !== '12.4.2')
    throw new Error('Use pnpm 12.4.2 for this qualified installer');
  run(dsh, ['--profile', profile, '--from-default-profile', 'web', '--dump-config']);
  const manifestPath = join(directory, 'package.json');
  const manifest = packagedProfileManifest(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    artifacts,
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(directory, 'pnpm-workspace.yaml'), packagedWorkspaceSettings('', artifacts));
  const [installCommand, installArgs] = pnpmCommand(['install']);
  process.stdout.write(run(installCommand, installArgs, directory));
  const installed = verifyPackagedProfile(directory, artifacts);
  verifyProductComposition(
    parseProductComposition(run(dsh, ['--profile', profile, '--dump-config'])),
  );
  return { installed, profile, dshVersion, componentsVerified: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = new Map();
    for (let index = 2; index < process.argv.length; index += 2) {
      const flag = process.argv[index];
      const value = process.argv[index + 1];
      if (
        !['--home', '--profile', '--artifacts', '--dsh'].includes(flag) ||
        !value ||
        flags.has(flag)
      )
        throw new Error(
          'usage: install-source-profile.mjs --home <new-home> --profile <new-profile> --artifacts <product-artifacts> [--dsh <binary>]',
        );
      flags.set(flag, value);
    }
    for (const flag of ['--home', '--profile', '--artifacts'])
      if (!flags.has(flag)) throw new Error(`Required: ${flag}`);
    console.log(
      JSON.stringify(
        installSourceProfile({
          home: flags.get('--home'),
          profile: flags.get('--profile'),
          artifacts: flags.get('--artifacts'),
          dsh: flags.get('--dsh'),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
