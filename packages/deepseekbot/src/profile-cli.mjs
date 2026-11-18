import { runProfileRestoreCli } from '@botharness/core';

try {
  await runProfileRestoreCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ code: error.code ?? 'restore-failed', message: error.message })}\n`,
  );
  process.exitCode = 1;
}
