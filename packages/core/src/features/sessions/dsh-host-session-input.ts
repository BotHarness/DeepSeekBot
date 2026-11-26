import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Context } from '@deepseek-ai/cordis';
import {
  REMOTE_EVENT_RESULT_ENDPOINT,
  REMOTE_EVENT_STREAM_ENDPOINT,
  REMOTE_EVENT_STREAM_PAYLOAD,
} from '@deepseek-ai/dsh-api-gateway/stream-protocol';
import { serverResponseSchema } from '@deepseek-ai/dsh-client-connection';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import type { UserQuestionProjectionView } from '@deepseek-ai/dsh-user-questions/types';
import type {
  HostSessionApprovalDecision,
  HostSessionPendingInput,
} from '@botharness/host-protocol/host-sessions';
import type { QuestionAnswer, QuestionItem } from '@botharness/host-protocol/wire';
import { z } from 'zod';
import { validQuestionAnswer } from '../../channels/user-questions.js';
import { PRIVATE_INPUT_TOOLS } from '../../credentials/tool-contract.js';
import type { NativeSessionAttentionEntry } from '../activity/native-session-attention.js';
import { folderName } from './workspace-sessions.js';

const question = z.object({
  id: z.string(),
  question: z.string(),
  detail: z.string().optional(),
  header: z.string().optional(),
  options: z.array(z.object({ label: z.string(), description: z.string().optional() })).optional(),
  multiSelect: z.boolean().optional(),
  intent: z
    .object({
      kind: z.string(),
      approve: z.string().optional(),
      reject: z.string().optional(),
      subject: z.object({ name: z.string() }).optional(),
    })
    .optional(),
});

const frame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), clientId: z.string() }),
  z.object({ type: z.literal('cancel'), eventId: z.string() }),
  z.object({
    type: z.literal('waterfall'),
    event: z.string(),
    eventId: z.string(),
    agentId: z.string(),
    request: z.unknown(),
  }),
]);

const approvalRequest = z.object({
  toolName: z.string(),
  callId: z.string().optional(),
  reason: z.string().optional(),
});

type Pending = {
  sessionId: string;
  card: HostSessionPendingInput;
  approvalOptions?: { id: string; approve: string; reject: string };
  createdAt?: string;
};

export function pendingCard(
  event: Extract<z.infer<typeof frame>, { type: 'waterfall' }>,
): Pending | undefined {
  const { eventId: requestId, agentId: sessionId } = event;
  if (event.event === 'approval/request') {
    const parsed = approvalRequest.safeParse(event.request);
    if (!parsed.success) return undefined;
    const { toolName, callId, reason } = parsed.data;
    return {
      sessionId,
      card: {
        kind: 'approval',
        requestId,
        toolName,
        ...(callId === undefined ? {} : { callId }),
        ...(reason === undefined ? {} : { reason }),
      },
    };
  }
  if (event.event !== 'user-questions/request') return undefined;
  const parsed = z.object({ questions: z.array(question).min(1) }).safeParse(event.request);
  if (!parsed.success) return undefined;
  const [first, ...rest] = parsed.data.questions;
  const intent = first?.intent;
  if (
    rest.length === 0 &&
    first !== undefined &&
    intent?.kind === 'approval' &&
    intent.approve &&
    intent.reject
  ) {
    return {
      sessionId,
      card: {
        kind: 'approval',
        requestId,
        toolName: intent.subject?.name ?? first.question,
        ...(first.detail === undefined ? {} : { reason: first.detail }),
      },
      approvalOptions: { id: first.id, approve: intent.approve, reject: intent.reject },
    };
  }
  return {
    sessionId,
    card: {
      kind: 'question',
      requestId,
      questions: parsed.data.questions.map(toQuestionItem),
    },
  };
}

function toQuestionItem(item: z.infer<typeof question>): QuestionItem {
  const { id, question, detail, header, options, multiSelect } = item;
  return {
    id,
    question,
    ...(detail === undefined ? {} : { detail }),
    ...(header === undefined ? {} : { header }),
    ...(options === undefined
      ? {}
      : {
          options: options.map(({ label, description }) => ({
            label,
            ...(description === undefined ? {} : { description }),
          })),
        }),
    ...(multiSelect === undefined ? {} : { multiSelect }),
  };
}

function continued(view: UserQuestionProjectionView | undefined): HostSessionPendingInput[] {
  return (
    view?.active.flatMap((item) =>
      item.state === 'continued'
        ? [
            {
              kind: 'question',
              requestId: item.callId,
              questions: item.questions.map(toQuestionItem),
              continued: true,
            },
          ]
        : [],
    ) ?? []
  );
}

type EventOutcome = { kind: 'next' } | { kind: 'result'; value: unknown };

export type NativeToolPreview = (sessionId: string, callId: string) => string | undefined;

export function withPreview(
  sessionId: string,
  card: HostSessionPendingInput,
  toolPreview: NativeToolPreview | undefined,
): HostSessionPendingInput {
  if (
    card.kind !== 'approval' ||
    card.callId === undefined ||
    card.preview !== undefined ||
    PRIVATE_INPUT_TOOLS.has(card.toolName)
  )
    return card;
  const preview = toolPreview?.(sessionId, card.callId);
  return preview === undefined ? card : { ...card, preview };
}

export function dshHostSessionInput(
  ctx: Context,
  isUnowned: (sessionId: string) => boolean,
  changed: (sessionId: string) => void,
  toolPreview?: NativeToolPreview,
) {
  const pending = new Map<string, Pending>();
  const submitting = new Set<string>();
  const listeners = new Set<() => void>();
  let send: ((eventId: string, outcome: EventOutcome) => Promise<void>) | undefined;

  function notify(sessionId: string) {
    changed(sessionId);
    for (const listener of [...listeners]) listener();
  }

  function remove(id: string) {
    const entry = pending.get(id);
    if (entry !== undefined && pending.delete(id)) notify(entry.sessionId);
  }

  ctx.inject(['connection', 'typertGateway'], (host) => {
    const lifetime = new AbortController();
    host.effect(() => () => lifetime.abort(), 'botharness: native Session Remote Events');

    let attempt = 0;
    const consume = async () => {
      const { connection, typertGateway } = host;
      const peer = connection.createPeer({ principal: { kind: 'owner' }, interactions: 'answer' });
      const handler = connection.createSharedFetchHandler('/api');
      const stream = await typertGateway.wireStream.open(
        REMOTE_EVENT_STREAM_ENDPOINT,
        REMOTE_EVENT_STREAM_PAYLOAD,
        (async function* () {})(),
        peer,
        lifetime.signal,
      );
      for await (const raw of stream) {
        if (typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'emit')
          continue;
        const parsed = frame.safeParse(raw);
        if (!parsed.success) continue;
        const event = parsed.data;
        switch (event.type) {
          case 'ready': {
            const { clientId } = event;
            attempt = 0;
            send = async (eventId, outcome) => {
              const response = await handler.fetch(
                new Request('http://localhost/api/' + REMOTE_EVENT_RESULT_ENDPOINT, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  signal: lifetime.signal,
                  body: JSON.stringify({
                    type: 'client-request',
                    rpcId: randomUUID(),
                    method: REMOTE_EVENT_RESULT_ENDPOINT,
                    payload: { args: { clientId, eventId, outcome } },
                  }),
                }),
                peer,
              );
              const result = serverResponseSchema.safeParse(await response.json());
              if (!response.ok || !result.success || !result.data.result.ok)
                throw new Error('DSH Remote Event result was refused');
            };
            break;
          }
          case 'waterfall': {
            const agent = ctx.agents.get(SessionId(event.agentId));
            const header = agent?.session.header;
            const entry =
              header !== undefined &&
              header.parentSession === undefined &&
              header.origin !== 'subagent' &&
              isUnowned(event.agentId)
                ? pendingCard(event)
                : undefined;
            if (entry === undefined) {
              void send?.(event.eventId, { kind: 'next' }).catch(() => undefined);
            } else {
              pending.set(event.eventId, { ...entry, createdAt: new Date().toISOString() });
              notify(entry.sessionId);
            }
            break;
          }
          case 'cancel':
            remove(event.eventId);
        }
      }
    };
    void (async () => {
      while (!lifetime.signal.aborted) {
        await consume().catch(() => undefined);
        send = undefined;
        for (const id of pending.keys()) remove(id);
        if (lifetime.signal.aborted) return;
        ctx.logger.warn('botharness.native-session-input.stream-ended');
        await delay(Math.min(30_000, 500 * 2 ** attempt), undefined, {
          signal: lifetime.signal,
        }).catch(() => undefined);
        attempt += 1;
      }
    })();
  });

  const active = (id: string) =>
    [...pending.values()]
      .filter((entry) => entry.sessionId === id)
      .map((entry) => withPreview(id, entry.card, toolPreview));
  const liveQuestions = (id: string) => {
    const agent = ctx.agents.get(SessionId(id));
    return agent === undefined
      ? undefined
      : ctx.get('sessionProjections')?.snapshot(agent.session, ['userQuestions']).values
          .userQuestions;
  };

  async function submit(sessionId: string, requestId: string, value: unknown): Promise<boolean> {
    if (send === undefined || submitting.has(requestId) || !isUnowned(sessionId)) return false;
    submitting.add(requestId);
    try {
      await send(requestId, { kind: 'result', value });
      remove(requestId);
      return true;
    } finally {
      submitting.delete(requestId);
    }
  }

  function validate(questions: QuestionItem[], answer: QuestionAnswer) {
    if (!validQuestionAnswer(questions, answer, { allowSkipped: true }))
      throw new RemoteError('invalid-input', 'The answer does not match the pending questions', {});
  }

  const title = (id: string): string | undefined => {
    const agent = ctx.agents.get(SessionId(id));
    if (agent === undefined) return undefined;
    const value: unknown = ctx.get('sessionProjections')?.snapshot(agent.session, ['title'])
      .values.title;
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  const workingFolder = (id: string): string | undefined => {
    const cwd = ctx.agents.get(SessionId(id))?.session.header?.cwd;
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined;
  };

  return {
    attention(): NativeSessionAttentionEntry[] {
      return [...pending.values()].flatMap(({ sessionId, card: held, createdAt }) => {
        if (!isUnowned(sessionId)) return [];
        const card = withPreview(sessionId, held, toolPreview);
        const sessionTitle = title(sessionId);
        const cwd = workingFolder(sessionId);
        const sessionFolder = cwd === undefined ? undefined : folderName(cwd);
        return [
          {
            sessionId,
            requestId: card.requestId,
            input: card.kind,
            summary:
              card.kind === 'approval'
                ? [card.toolName, card.preview ?? card.reason].filter(Boolean).join(' · ')
                : card.questions.map((item) => item.question).join(' · '),
            createdAt: createdAt ?? new Date(0).toISOString(),
            ...(sessionTitle === undefined ? {} : { sessionTitle }),
            ...(sessionFolder === undefined ? {} : { folderName: sessionFolder }),
            ...(cwd === undefined ? {} : { cwd }),
            request: card,
          },
        ];
      });
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fromSnapshot(id: string, view: UserQuestionProjectionView | undefined) {
      return [...active(id), ...continued(view)];
    },
    async pending(id: string) {
      return [...active(id), ...continued(liveQuestions(id))];
    },
    async answerApproval(id: string, requestId: string, decision: HostSessionApprovalDecision) {
      const entry = pending.get(requestId);
      if (entry?.sessionId !== id || entry.card.kind !== 'approval') return false;
      const options = entry.approvalOptions;
      return submit(
        id,
        requestId,
        options === undefined
          ? decision
          : {
              answers: [
                {
                  id: options.id,
                  selected: [decision === 'allowed-once' ? options.approve : options.reject],
                },
              ],
            },
      );
    },
    async answerQuestion(
      id: string,
      requestId: string,
      answer: QuestionAnswer,
      allowed: () => boolean = () => true,
    ) {
      const entry = pending.get(requestId);
      if (entry !== undefined) {
        if (entry.sessionId !== id || entry.card.kind !== 'question') return false;
        validate(entry.card.questions, answer);
        return submit(id, requestId, answer);
      }
      const service = ctx.get('userQuestions');
      const controller = ctx.get('sessionController');
      if (service === undefined || controller === undefined) return false;
      const sessionId = SessionId(id);
      const projection =
        liveQuestions(id) ??
        (await controller.projections({ sessionId }, new AbortController().signal))?.values
          .userQuestions;
      const pendingQuestion = continued(projection).find(
        (item) => item.kind === 'question' && item.requestId === requestId,
      );
      if (pendingQuestion?.kind !== 'question' || !isUnowned(id) || !allowed()) return false;
      validate(pendingQuestion.questions, answer);
      const result = await controller.resolveAgent(sessionId);
      if ('error' in result) throw result.error;
      if (!isUnowned(id) || !allowed()) return false;
      return service.answer(result.agent, ToolCallId(requestId), answer);
    },
  };
}

export type DshHostSessionInput = ReturnType<typeof dshHostSessionInput>;
