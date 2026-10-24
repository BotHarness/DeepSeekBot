import { runHelpClient } from './help-client.mjs';
import { runBotCreateCli } from '@botharness/core/cli';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

try {
  process.exitCode =
    process.argv[2] === 'help-client'
      ? await runHelpClient(process.argv.slice(3))
      : await runBotCreateCli(process.argv.slice(2), {
          env: process.env,
          stdout: (text) => process.stdout.write(`${text}\n`),
          stderr: (text) => process.stderr.write(`${text}\n`),
          readStdin,
        });
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ error: { code: 'internal-error', message: 'The command failed before producing a result.' } }, null, 2)}\n`,
  );
  process.stderr.write(`deepseekbot: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
