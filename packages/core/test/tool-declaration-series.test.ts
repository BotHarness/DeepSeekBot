import { Context } from '@deepseek-ai/cordis';
import type { PreStepDecision } from '@deepseek-ai/dsh-agent';
import {
  LlmAdapter,
  LlmRuntime,
  createDeveloperMessage,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it } from 'vitest';
import { restartEmptyToolSeries } from '../src/runtime/tool-declaration-series.js';

const config = { provider: 'test-deepseek', model: 'test-model' };
const tools: ToolSchema[] = [
  { name: 'read', description: 'Read', parameters: { type: 'object', properties: {} } },
  { name: 'reply', description: 'Reply', parameters: { type: 'object', properties: {} } },
];

class InspectAdapter extends LlmAdapter {
  requests: GenerateOptions[] = [];

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model, toolUpdate: 'addition-only' };
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

function emptySeries(): Session {
  const session = Session.create(SessionId('empty-tools-regression'));
  session.append('request/header', { header: { config, tools }, reason: 'initial' });
  session.append('request/header', {
    header: { config },
    reason: 'change',
    startsSeries: true,
  });
  return session;
}

function restoreTools(session: Session, decision: PreStepDecision): void {
  if (decision.kind !== 'enter') return;
  const { seq } = session.append('request/header', {
    header: { config, tools },
    reason: 'change',
    ...(decision.startsRequestSeries ? { startsSeries: true } : {}),
  });
  session.append(
    'developer/message',
    {
      turn: 2,
      step: 1,
      headerSeq: seq,
      message: createDeveloperMessage({
        source: { kind: 'tool-registry' },
        content: tools.map((tool) => ({ type: 'tool-addition', toolName: tool.name })),
      }),
    },
    { surfaceOp: 'append' },
  );
}

async function projectedTools(session: Session): Promise<ToolSchema[]> {
  const ctx = new Context();
  const fiber = ctx.plugin(LlmRuntime);
  await fiber.await();
  const adapter = new InspectAdapter();
  ctx.llm.registerAdapter([config.provider], adapter);
  try {
    const chunks: StreamChunk[] = [];
    for await (const chunk of ctx.llm.stream({
      ...config,
      tools: [...(session.requestHeader()?.tools ?? [])],
      messages: session.deriveMessages(),
      toolHistory: session.toolHistory(),
      sessionId: session.id,
    }))
      chunks.push(chunk);
    expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'stop' } }]);
    expect(adapter.requests).toHaveLength(1);
    return adapter.requests[0]?.tools ?? [];
  } finally {
    await fiber.dispose();
  }
}

describe('empty native tool declaration series', () => {
  it('reproduces all-deferred declarations without a new series', async () => {
    const session = emptySeries();
    restoreTools(session, { kind: 'enter', messages: [] });
    const projected = await projectedTools(session);
    expect(projected).toHaveLength(2);
    expect(projected.every((tool) => tool.deferLoading === true)).toBe(true);
  });

  it.each([false, true])(
    'restores usable declarations after failure (reloaded: %s)',
    async (reload) => {
      let session = emptySeries();
      restoreTools(session, { kind: 'enter', messages: [] });
      if (reload) session = Session.create(session.id, session.snapshotEvents());
      const prior = session.snapshotEvents();
      const decision = restartEmptyToolSeries(session, { kind: 'enter', messages: [] });
      restoreTools(session, decision);
      const projected = await projectedTools(session);
      expect(projected).toHaveLength(2);
      expect(projected.some((tool) => tool.deferLoading !== true)).toBe(true);
      expect(session.snapshotEvents().slice(0, prior.length)).toEqual(prior);
    },
  );

  it('preserves a rejected step', () => {
    const decision: PreStepDecision = { kind: 'reject' };
    expect(restartEmptyToolSeries(emptySeries(), decision)).toBe(decision);
  });

  it('prevents the first failure when tools return after an empty request', async () => {
    const session = emptySeries();
    restoreTools(session, restartEmptyToolSeries(session, { kind: 'enter', messages: [] }));
    expect(await projectedTools(session)).toEqual(tools);
  });

  it('keeps a genuinely tool-less request tool-less', async () => {
    const session = emptySeries();
    const decision = restartEmptyToolSeries(session, { kind: 'enter', messages: [] });
    if (decision.kind !== 'enter') throw new Error('Step unexpectedly rejected');
    session.append('request/header', {
      header: { config },
      reason: 'series',
    });
    expect(await projectedTools(session)).toEqual([]);
  });

  it('does not reset a nonempty baseline or change intentional deferred declarations', () => {
    const session = Session.create(SessionId('normal-tools'));
    session.append('request/header', { header: { config, tools }, reason: 'initial' });
    const decision: PreStepDecision = { kind: 'enter', messages: [] };
    expect(restartEmptyToolSeries(session, decision)).toBe(decision);
    session.append('request/header', {
      header: { config, tools: tools.map((tool) => ({ ...tool, deferLoading: true })) },
      reason: 'series',
    });
    expect(restartEmptyToolSeries(session, decision)).toBe(decision);
  });

  it('preserves deferred additions when an immediate baseline tool exists', async () => {
    const session = Session.create(SessionId('normal-addition'));
    session.append('request/header', {
      header: { config, tools: tools.slice(0, 1) },
      reason: 'initial',
    });
    restoreTools(session, restartEmptyToolSeries(session, { kind: 'enter', messages: [] }));
    const projected = await projectedTools(session);
    expect(projected.find((tool) => tool.name === 'read')?.deferLoading).toBeUndefined();
    expect(projected.find((tool) => tool.name === 'reply')?.deferLoading).toBe(true);
  });

  it('keeps legacy Hosts without tool history unchanged', () => {
    const decision: PreStepDecision = { kind: 'enter', messages: [] };
    expect(restartEmptyToolSeries({}, decision)).toBe(decision);
  });
});
