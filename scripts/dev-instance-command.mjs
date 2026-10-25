import { spawnSync } from 'node:child_process';

process.once('disconnect', () => process.exit(1));
process.once('message', ({ command, args }) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) process.stderr.write(`${result.error.message}\n`);
  process.exit(result.status ?? 1);
});
