import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('documents turn-authorized Channels and Bot membership in both CLI guides', () => {
  const guide = (name: string) =>
    readFileSync(new URL(`../../../docs/${name}`, import.meta.url), 'utf8')
      .split('\n')
      .find((line) => line.includes('`engine tools <bot>`') && line.includes('`tool_search`'));

  expect(guide('bot-cli.md')).toMatch(/accepted Source Events.*steered messages.*Bot.*member/);
  expect(guide('bot-cli.zh.md')).toMatch(/本轮已接收的 Source Event.*steer.*Bot.*成员/);
});
