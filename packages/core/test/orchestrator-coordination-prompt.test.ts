import { describe, expect, it } from 'vitest';

import { DEFAULT_PROMPT_TEXT, defaultPromptText } from '../src/prompts/prompt-parts.js';
import {
  hostWorkContext,
  onlyActiveGrant,
  orchestratorPromptSections,
} from '../src/runtime/dsh-bot-agent-adapter.js';

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

describe('Orchestrator Host context', () => {
  const grant = (id: string, revokedAt?: string) =>
    ({
      id,
      workspaceTitle: `Folder ${id}`,
      workspacePath: `/work/${id}`,
      ...(revokedAt === undefined ? {} : { revokedAt }),
    }) as unknown as ReturnType<Parameters<typeof hostWorkContext>[0]['grants']>[number];
  const assignment = (sessionId: string, archivedAt?: string) =>
    ({
      sessionId,
      title: `Task ${sessionId}`,
      continuityKey: `key-${sessionId}`,
      activity: 'running',
      ...(archivedAt === undefined ? {} : { archivedAt }),
    }) as unknown as ReturnType<Parameters<typeof hostWorkContext>[0]['list']>[number];

  it('sizes each Assignment and closes the turn with the final answer', () => {
    expect(coordination).toContain('Size each Assignment to the ask');
    expect(coordination).toContain('resolve its Inbox items in that same send');
  });

  it('lists active Grants and unarchived Assignments only', () => {
    const text = hostWorkContext({
      grants: () => [grant('g1'), grant('g2', '2026-01-01')],
      list: () => [assignment('s1'), assignment('s2', '2026-01-01')],
    });
    expect(text.startsWith('[Host context]')).toBe(true);
    expect(text).toContain('- Grant g1: "Folder g1" at /work/g1');
    expect(text).not.toContain('g2');
    expect(text).toContain('- Assignment s1: "Task s1" key key-s1, running');
    expect(text).not.toContain('s2');
    expect(hostWorkContext({ grants: () => [], list: () => [] })).toContain('Grants: none');
  });

  it('defaults grant_id only when exactly one Grant is active', () => {
    expect(onlyActiveGrant({ grants: () => [grant('g1'), grant('g2', 'x')] })).toBe('g1');
    expect(() => onlyActiveGrant({ grants: () => [] })).toThrow('request_workspace_grant');
    expect(() => onlyActiveGrant({ grants: () => [grant('g1'), grant('g3')] })).toThrow(
      'pass grant_id (g1, g3)',
    );
  });
});
