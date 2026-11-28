import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const directEdgePackages = [
  {
    name: '@botharness/tobs-relay-linux-x64',
    os: 'linux',
    cpu: 'x64',
    goarch: 'amd64',
    executable: 'tobs-relay',
    license: 'MIT',
  },
  {
    name: '@botharness/tobs-relay-linux-arm64',
    os: 'linux',
    cpu: 'arm64',
    goarch: 'arm64',
    executable: 'tobs-relay',
    license: 'MIT',
  },
];

export function stageDirectEdgePackages({ repoRoot, staging, version }) {
  return directEdgePackages.map(({ name, os, cpu, goarch, executable, license }) => {
    const directory = join(staging, name.split('/')[1]);
    const binary = join(directory, 'bin', executable);
    mkdirSync(join(directory, 'bin'), { recursive: true });
    const build = spawnSync('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', binary, '.'], {
      cwd: join(repoRoot, 'deploy', 'private-relay'),
      env: { ...process.env, GOOS: os, GOARCH: goarch, CGO_ENABLED: '0' },
      shell: false,
      windowsHide: true,
      stdio: 'inherit',
    });
    if (build.error) throw build.error;
    if (build.status !== 0) throw new Error(`Could not build ${name} (exit ${build.status})`);
    chmodSync(binary, 0o755);
    copyFileSync(join(repoRoot, 'LICENSE'), join(directory, 'LICENSE'));
    writeFileSync(
      join(directory, 'package.json'),
      `${JSON.stringify(
        {
          name,
          version,
          description: 'Tobs public direct connection and private relay binary',
          license,
          repository: {
            type: 'git',
            url: 'git+https://github.com/BotHarness/BotHarness.git',
            directory: 'deploy/private-relay',
          },
          os: [os],
          cpu: [cpu],
          files: [`bin/${executable}`, 'LICENSE'],
          publishConfig: { access: 'public' },
        },
        null,
        2,
      )}\n`,
    );
    return directory;
  });
}
