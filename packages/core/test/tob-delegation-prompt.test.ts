import { describe, expect, it } from 'vitest';

import { DEFAULT_PROMPT_TEXT } from '../src/prompts/prompt-parts.js';
import { orchestratorPromptSections } from '../src/runtime/dsh-bot-agent-adapter.js';

const tobRole = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, true).role;
const botRole = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, false).role;
const delegation = tobRole.slice(tobRole.indexOf('Tob Delegation:')).split('\n')[0];

describe('Tob Delegation prompt', () => {
  it('gives only Tob the delegation contract', () => {
    expect(tobRole).toContain('Tob Delegation:');
    expect(botRole).not.toContain('Tob Delegation');
    expect(botRole).not.toContain('single point of contact');
  });

  it('keeps trivial requests with Tob and delegates the rest without asking first', () => {
    expect(delegation).toContain('Answer a trivial request yourself');
    expect(delegation).toContain('delegate it without asking the Human first');
    expect(delegation).toContain('call list_bot_contacts');
    expect(delegation).toContain('one bot_send_message with its botId as bot_id');
    expect(delegation).toContain('Send to one colleague only and never repeat the send');
  });

  it('reports the colleague result back in the Human DM', () => {
    expect(delegation).toContain("When the colleague's reply arrives in your Inbox");
    expect(delegation).toContain('with bot_send_message in your Human DM');
  });

  it('sends nothing and offers creation when no colleague fits', () => {
    expect(delegation).toContain('send nothing to any Bot');
    expect(delegation).toContain('offer to create one, creating it only after the Human agrees');
  });

  it('carries no approval authority', () => {
    expect(delegation).toContain(
      'never relay, make or promise an approval decision for a colleague',
    );
    expect(delegation).toContain('its own approvals still go to the Human');
  });

  it('keeps Tob creation on the scoped CLI after the delegation guidance', () => {
    expect(tobRole.indexOf('Tob Delegation:')).toBeLessThan(
      tobRole.indexOf('When the Human asks you to create a Bot, use the scoped deepseekbot CLI'),
    );
    expect(tobRole).not.toContain('Create a new PersonaBot with bot_create');
  });
});
