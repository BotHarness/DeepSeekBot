import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const [command, value] = process.argv.slice(2);

function addHost(name) {
  if (!name || !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(name) || name === 'default') {
    console.error(
      'Pass a Host name of lowercase letters, digits and dashes (not "default"), for example: node setup.mjs add-host office-mac',
    );
    process.exitCode = 1;
    return;
  }
  mkdirSync(join(root, 'hosts'), { recursive: true, mode: 0o755 });
  const keys = join(root, 'hosts', 'keys');
  const listed = existsSync(keys)
    ? readFileSync(keys, 'utf8')
        .split('\n')
        .some((line) => line.split(/\s+/u)[0] === name)
    : false;
  const keyFile = join(root, `host-${name}.secret`);
  if (listed || existsSync(keyFile)) {
    console.error(`Host "${name}" already has a claim key. Pick another name.`);
    process.exitCode = 1;
    return;
  }
  const key = randomBytes(32).toString('hex');
  writeFileSync(keyFile, key + '\n', { mode: 0o600, flag: 'wx' });
  appendFileSync(keys, `${name} ${createHash('sha256').update(key).digest('hex')}\n`, {
    mode: 0o644,
  });
  console.log(
    JSON.stringify(
      {
        phase: 'host-key-created',
        host: name,
        setupKeyFile: keyFile,
        next: 'Give this key to that computer only and claim from its DeepSeekBot Settings → Connections → Docker private relay. The key works once; no restart is needed.',
      },
      null,
      2,
    ),
  );
}

function configure(domain) {
  if (
    !domain ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/u.test(domain)
  ) {
    console.error(
      'Pass the public DNS name already pointing to this server. Both phone and Host must reach this server on HTTPS. Home-only Docker behind NAT is insufficient.',
    );
    process.exitCode = 1;
  } else if (existsSync(join(root, '.env')) || existsSync(join(root, 'bootstrap.secret'))) {
    console.error(
      'Setup files already exist. They were preserved; do not reset an already claimed deployment. To serve another computer, run: node setup.mjs add-host <name>',
    );
    process.exitCode = 1;
  } else {
    const bootstrap = randomBytes(32).toString('hex');
    mkdirSync(join(root, 'hosts'), { recursive: true, mode: 0o755 });
    writeFileSync(join(root, 'bootstrap.secret'), bootstrap + '\n', { mode: 0o600, flag: 'wx' });
    writeFileSync(
      join(root, '.env'),
      'RELAY_DOMAIN=' + domain + '\nRELAY_BOOTSTRAP=' + bootstrap + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    console.log(
      JSON.stringify(
        {
          phase: 'configured-not-deployed',
          compose: join(root, 'compose.yaml'),
          setupKeyFile: join(root, 'bootstrap.secret'),
          origin: 'https://' + domain,
          prerequisite:
            'Public DNS must point to this server; inbound TCP 80 and 443 must be reachable. Start Compose, then claim from DeepSeekBot Settings → Connections → Docker private connection. A successful local setup is not proof of external reachability. For more computers, run: node setup.mjs add-host <name>',
        },
        null,
        2,
      ),
    );
  }
}

if (command === 'add-host') addHost(value);
else configure(command);
