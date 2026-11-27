import { expect, it } from 'vitest';
import { parseBotCliArgs } from '../src/kernel/cli-options.js';
import { runCreate, validatedCreate } from '../src/cli/cli-create.js';

const values = (...argv: string[]) => parseBotCliArgs(['create', ...argv]).values;
const stdin = async () => '';

it('parses --from-sessions into unique Session ids for online creation', async () => {
  expect(
    await validatedCreate(
      values('--name', 'Keeper', '--from-sessions', 'a, b,a', '--persona', 'Calm'),
      stdin,
    ),
  ).toMatchObject({
    displayName: 'Keeper',
    persona: 'Calm',
    source: { kind: 'sessions', sessionIds: ['a', 'b'] },
  });
});

it('refuses --from-sessions without a name, with another source or with blank-only options', async () => {
  for (const argv of [
    ['--from-sessions', 'a'],
    ['--name', 'K', '--from-sessions', 'a', '--from-git', 'o/r'],
    ['--name', 'K', '--from-sessions', 'a', '--memory-location', '/tmp/m'],
    ['--name', 'K', '--from-sessions', ' , '],
    ['--name', 'K', '--from-sessions', ''],
    ['--name', 'K', '--from-sessions', '  '],
  ])
    await expect(validatedCreate(values(...argv), stdin)).rejects.toMatchObject({ code: 'usage' });
});

it('refuses offline --from-sessions before reading stdin', async () => {
  let read = false;
  await expect(
    runCreate(values('--from-sessions', 'a', '--persona-stdin'), {} as never, async () => {
      read = true;
      return '';
    }),
  ).rejects.toMatchObject({ code: 'usage', message: expect.stringContaining('--host') });
  expect(read).toBe(false);
});
