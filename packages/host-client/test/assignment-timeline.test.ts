import { expect, it, vi } from 'vitest';
import { readAssignmentTimeline } from '../src/assignment-timeline';
import { HostAnswerInvalid } from '../src/host-answer';

const at = '2026-11-20T00:00:00Z';
const ref = { slug: 'tea', sessionId: 'session' };
const assignment = {
  botSlug: 'tea',
  sessionId: 'session',
  sourceEventId: 'source',
  title: 'Brew tea',
  description: '',
  activity: 'working',
  createdAt: at,
  updatedAt: at,
};
const entry = { status: 'done', kind: 'read', tool: 'read_file', at };
const lane = {
  role: 'main',
  index: 0,
  sessionId: 'session',
  state: 'running',
  entries: [entry],
  omitted: 0,
};
const timeline = { assignment, lanes: [lane], omittedSubagents: 0 };
const read = (value: unknown) =>
  readAssignmentTimeline({ call: vi.fn().mockResolvedValue(value) }, ref);

it('accepts the Assignment timeline with absent and valid optional fields', async () => {
  await expect(read(timeline)).resolves.toEqual(timeline);
  const complete = {
    ...timeline,
    assignment: {
      ...assignment,
      continuityKey: 'tea',
      executionWait: 'waiting-human',
      latestReport: { state: 'waiting-human', summary: 'Which tea?', at, expectsReply: true },
      openAsk: { sourceEventId: 'ask', summary: 'Which tea?', at },
      permission: {
        grantId: 'grant',
        workspaceId: 'tea',
        primaryCwd: '/tea',
        mode: 'workspace-write',
        approval: 'ask',
        presetRevision: 1,
      },
    },
    lanes: [
      {
        ...lane,
        title: 'Tea',
        startedAt: at,
        updatedAt: at,
        round: 1,
        route: { provider: 'provider', model: 'model', reasoningEffort: 'high' },
        entries: [{ ...entry, detail: 'recipe.txt', round: 1 }],
      },
    ],
    rounds: [{ index: 1, kind: 'created', at, instruction: 'Brew tea' }],
    omittedRounds: 0,
  };
  await expect(read(complete)).resolves.toEqual(complete);
});

it.each([
  { botSlug: 'other' },
  { sourceEventId: undefined },
  { description: null },
  { archivedAt: null },
  { agentPreset: 1 },
  { continuityKey: null },
  { openAsk: { sourceEventId: 'ask', summary: 'Tea' } },
  { executionWait: 'done' },
  { modelRoute: { provider: 'p', model: 'm', reasoningEffort: 1 } },
  { latestReport: { state: 'progress', summary: 'Tea', at, expectsReply: 3 } },
  {
    permission: {
      grantId: 'grant',
      workspaceId: 'tea',
      primaryCwd: '/tea',
      mode: 'workspace-write',
      approval: 'ask',
      presetRevision: -1,
    },
  },
])('refuses malformed Assignment fields %j', async (change) => {
  await expect(
    read({ ...timeline, assignment: { ...assignment, ...change } }),
  ).rejects.toBeInstanceOf(HostAnswerInvalid);
});

it.each([
  { state: 'unknown' },
  { title: null },
  { round: -1 },
  { route: { provider: 'p', model: 'm', reasoningEffort: false } },
  { startedAt: false },
  { updatedAt: null },
  { omitted: undefined },
  { entries: [{ ...entry, detail: false }] },
  { entries: [{ ...entry, round: '1' }] },
])('refuses malformed lanes and entries %j', async (change) => {
  await expect(read({ ...timeline, lanes: [{ ...lane, ...change }] })).rejects.toBeInstanceOf(
    HostAnswerInvalid,
  );
});

it.each([
  { rounds: null },
  { omittedSubagents: undefined },
  { omittedRounds: '0' },
  { rounds: [{ index: 0, kind: 'created', at, instruction: null }] },
])('refuses malformed timeline metadata %j', async (change) => {
  await expect(read({ ...timeline, ...change })).rejects.toBeInstanceOf(HostAnswerInvalid);
});
