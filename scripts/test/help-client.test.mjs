import { expect, it } from 'vitest';
import { runHelpClient } from '../../packages/deepseekbot/src/help-client.mjs';
it('requires an explicitly selected local Client and refuses remote endpoints before connecting', async () => {
  for (const args of [
    [],
    ['--cdp', 'http://example.com', '--target', 'a'],
    ['--cdp', 'http://127.0.0.1:9222', '--target', 'a', '--action', 'evaluate'],
  ]) {
    const lines = [];
    expect(await runHelpClient(args, (line) => lines.push(JSON.parse(line)))).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0].ok).toBe(false);
  }
});

it('requires a question for FAQ navigation before opening a debugging connection', async () => {
  const lines = [];
  const result = await runHelpClient(
    ['--cdp', 'http://127.0.0.1:9222', '--target', 'page', '--action', 'show'],
    (line) => lines.push(JSON.parse(line)),
  );
  expect(result).toBe(1);
  expect(lines).toEqual([{ ok: false, error: { code: 'help_question_required' } }]);
});
