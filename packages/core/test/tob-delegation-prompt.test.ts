import { expect, it } from 'vitest';
import { DEFAULT_PROMPT_TEXT } from '../src/prompts/prompt-parts.js';
import { orchestratorPromptSections } from '../src/runtime/dsh-bot-agent-adapter.js';

it('gives the Steward one short management and delegation instruction', () => {
  const steward = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, true).role;
  const ordinary = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, false).role;
  const additions = steward
    .split('\n')
    .filter(
      (line) => !ordinary.split('\n').includes(line) && !line.startsWith('In a Group Channel'),
    );
  expect(additions).toHaveLength(1);
  expect(additions[0]!.length).toBeLessThan(450);
  expect(additions[0]).toContain('deepseekbot capabilities');
  expect(additions[0]).toContain('delegate once to a suitable colleague');
  expect(additions[0]).toContain('report their result in the Human DM');
  expect(ordinary).toContain('Create a new PersonaBot with bot_create');
  expect(steward).not.toContain('You are Tob');
});
