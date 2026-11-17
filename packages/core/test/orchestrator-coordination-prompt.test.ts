import { describe, expect, it } from 'vitest';

import { DEFAULT_PROMPT_TEXT, defaultPromptText } from '../src/prompts/prompt-parts.js';
import { orchestratorPromptSections } from '../src/runtime/dsh-bot-agent-adapter.js';

const coordination = defaultPromptText('coordination');
const role = orchestratorPromptSections(DEFAULT_PROMPT_TEXT).role;

describe('Orchestrator coordination prompt', () => {
  it('keeps only work-free asks with the Orchestrator', () => {
    expect(coordination).toContain('You are a coordinator: you run the work, Assignments do it.');
    expect(coordination).toContain('a quick answer from what you already know or your Memory');
    expect(role).toContain(
      'A simple question, a memory update, or a Channel reply stays with you and must not be delegated.',
    );
  });

  it('hands real work, web search included, to Assignments', () => {
    expect(coordination).toContain(
      'Hand everything else to an Assignment, even when you could do it yourself: web search or browsing',
    );
  });

  it('splits a request into parallel Assignments and does not block on them', () => {
    expect(coordination).toContain('create one Assignment for each in the same turn');
    expect(coordination).toContain('one Assignment per item, with you combining their reports');
    expect(coordination).toContain('Do not look around first');
    expect(coordination).toContain('end the turn instead of waiting');
    expect(role).toContain(
      'Only when you cannot continue without its next report in this turn, use wait_for_assignment',
    );
  });

  it('accepts results from the report instead of redoing the work', () => {
    expect(coordination).toContain('not by rerunning or re-checking the work with your own tools');
  });

  it('lets research use any active Grant and avoids a Grant request for a short lookup', () => {
    expect(coordination).toContain(
      'research that changes no project files may use any active Grant',
    );
    expect(coordination).toContain('With no active Grant, do a short lookup yourself');
  });

  it('leaves colleague delegation to the rules that name it', () => {
    expect(coordination).toContain(
      'to a person or Bot colleague instead when a rule below says so',
    );
    expect(orchestratorPromptSections(DEFAULT_PROMPT_TEXT, true).role).toContain('Tob Delegation:');
  });
});
