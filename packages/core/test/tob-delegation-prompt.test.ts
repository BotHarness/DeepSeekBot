import { expect, it } from 'vitest';
import { DEFAULT_PROMPT_TEXT } from '../src/prompts/prompt-parts.js';
import { orchestratorPromptSections } from '../src/runtime/dsh-bot-agent-adapter.js';
import { TOB_CHANNEL_CAPABILITIES } from '../src/features/tob/cli-channel-operations.js';
import { TOB_DIAGNOSTIC_CAPABILITIES } from '../src/features/tob/cli-diagnostic-operations.js';
import { TOB_HOST_CLI_CAPABILITY } from '../src/features/tob/cli-host-commands.js';
import { TOB_SHARE_DRAFT_CAPABILITIES } from '../src/features/tob/cli-share-draft-operations.js';

it('gives an App management grant holder one short management instruction', () => {
  const manager = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, true).role;
  const ordinary = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, false).role;
  const additions = manager
    .split('\n')
    .filter(
      (line) => !ordinary.split('\n').includes(line) && !line.startsWith('In a Group Channel'),
    );
  expect(additions).toHaveLength(1);
  expect(additions[0]!.length).toBeLessThan(450);
  expect(additions[0]).toContain('deepseekbot capabilities');
  expect(additions[0]).toContain('doctor first');
  expect(ordinary).not.toContain('bot_create');
  expect(manager).not.toContain('You are Tob');
});

it('keeps the management operating rules in the capability descriptions', () => {
  const describe = (command: string) =>
    [
      ...TOB_SHARE_DRAFT_CAPABILITIES,
      ...TOB_DIAGNOSTIC_CAPABILITIES,
      ...TOB_CHANNEL_CAPABILITIES,
      TOB_HOST_CLI_CAPABILITY,
    ].find((entry) => entry.command === command)!.description;
  expect(describe('share-draft-show')).toContain(
    'ask the Human with ask_user_question about that one file',
  );
  expect(describe('share-draft-show')).toContain('Ask one file at a time');
  expect(describe('doctor')).toContain('run doctor before answering');
  expect(describe('cli')).toContain('Read the target before any write');
  expect(describe('cli')).toContain('never approve or decide on the Human');
  expect(describe('group-invite')).toContain('never claim a pending invitation joined');
  expect(describe('group-invite')).toContain('automatic acceptance');
});
