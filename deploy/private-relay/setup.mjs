import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const domain = process.argv[2];
if (!domain || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/u.test(domain)) {
  console.error(
    'Pass the public DNS name already pointing to this server. Both phone and Host must reach this server on HTTPS. Home-only Docker behind NAT is insufficient.',
  );
  process.exitCode = 1;
} else if (existsSync(join(root, '.env')) || existsSync(join(root, 'bootstrap.secret'))) {
  console.error(
    'Setup files already exist. They were preserved; do not reset an already claimed deployment.',
  );
  process.exitCode = 1;
} else {
  const bootstrap = randomBytes(32).toString('hex');
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
          'Public DNS must point to this server; inbound TCP 80 and 443 must be reachable. Start Compose, then claim from DeepSeekBot Settings → Connections → Docker private connection. A successful local setup is not proof of external reachability.',
      },
      null,
      2,
    ),
  );
}
