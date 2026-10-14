import { MethodRefused, type HostClient } from './client';
import type {
  HumanAttentionItem,
  QuestionAnswer,
  QuestionItem,
  TimelineMessage,
  TimelinePage,
  ToolApprovalOutcome,
  ToolApprovalStatus,
  UserQuestionStatus,
} from './wire';

export type RequestStatus = 'pending' | 'decided' | 'expired';

export interface RequestRef {
  channelId: string;
  messageId: string;
  botSlug: string;
}

export interface ApprovalRequest extends RequestRef {
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
  status: RequestStatus;
  outcome?: ToolApprovalOutcome;
}

export interface QuestionRequest extends RequestRef {
  questions: QuestionItem[];
  status: RequestStatus;
}

export type DecisionResult = 'accepted' | 'decided' | 'expired';

export type ApprovalChoice = 'allowed-once' | 'allowed-always-exact' | 'rejected';

export function offersAlwaysAllow(toolName: string): boolean {
  return toolName !== 'secret_cli';
}

export function requestRef(item: HumanAttentionItem): RequestRef | undefined {
  if (item.channelId === undefined || item.messageId === undefined) return undefined;
  return {
    channelId: item.channelId,
    messageId: item.messageId,
    botSlug: item.botSlug,
  };
}

const CONTEXT_AFTER = 50;

async function readRequest(
  client: HostClient,
  ref: RequestRef,
): Promise<{ request: TimelineMessage; later: TimelineMessage[] }> {
  const { page } = await client.call<{ page: TimelinePage }>('channelTimeline', {
    channelId: ref.channelId,
    direction: 'around',
    around: ref.messageId,
    olderLimit: 0,
    newerLimit: CONTEXT_AFTER,
  });
  const index = page.entries.findIndex((entry) => entry.id === ref.messageId);
  if (index < 0) throw new Error('The request is no longer in this conversation.');
  return {
    request: page.entries[index]!,
    later: page.entries.slice(index + 1),
  };
}

export async function loadApproval(client: HostClient, ref: RequestRef): Promise<ApprovalRequest> {
  const [{ request, later }, { status }] = await Promise.all([
    readRequest(client, ref),
    client.call<{ status: ToolApprovalStatus }>('toolApprovalStatus', {
      channelId: ref.channelId,
      messageId: ref.messageId,
    }),
  ]);
  const card = request.toolApprovalRequest;
  if (card === undefined) throw new Error('This message is not a Tool approval.');
  const decision = later.find(
    (entry) => entry.toolApprovalDecision?.requestMessageId === ref.messageId,
  )?.toolApprovalDecision;
  return {
    ...ref,
    toolName: card.toolName,
    role: card.role,
    cwd: card.cwd,
    input: card.input,
    status: decision !== undefined ? 'decided' : status === 'pending' ? 'pending' : 'expired',
    ...(decision === undefined ? {} : { outcome: decision.outcome }),
  };
}

export async function decideApproval(
  client: HostClient,
  ref: RequestRef,
  outcome: ApprovalChoice,
): Promise<DecisionResult> {
  try {
    await client.call('toolApprovalDecide', {
      channelId: ref.channelId,
      messageId: ref.messageId,
      outcome,
    });
    return 'accepted';
  } catch (error) {
    if (!(error instanceof MethodRefused)) throw error;
    const now = await loadApproval(client, ref);
    if (now.status === 'pending') throw error;
    return now.status;
  }
}

function questionStatus(status: UserQuestionStatus, resolved: boolean): RequestStatus {
  if (resolved || status === 'answered' || status === 'submitted') return 'decided';
  return status === 'pending' ? 'pending' : 'expired';
}

export async function loadQuestion(client: HostClient, ref: RequestRef): Promise<QuestionRequest> {
  const [{ request, later }, { status }] = await Promise.all([
    readRequest(client, ref),
    client.call<{ status: UserQuestionStatus }>('userQuestionStatus', {
      channelId: ref.channelId,
      messageId: ref.messageId,
    }),
  ]);
  const card = request.userQuestionRequest;
  if (card === undefined) throw new Error('This message is not a Human question.');
  const resolution = later.find(
    (entry) => entry.userQuestionResolution?.requestMessageId === ref.messageId,
  )?.userQuestionResolution;
  return {
    ...ref,
    questions: card.questions,
    status:
      resolution?.state === 'cancelled'
        ? 'expired'
        : questionStatus(status, resolution !== undefined),
  };
}

export async function answerQuestion(
  client: HostClient,
  ref: RequestRef,
  answer: QuestionAnswer,
): Promise<DecisionResult> {
  try {
    await client.call('userQuestionAnswer', {
      channelId: ref.channelId,
      messageId: ref.messageId,
      answer,
    });
    return 'accepted';
  } catch (error) {
    if (!(error instanceof MethodRefused)) throw error;
    const now = await loadQuestion(client, ref);
    if (now.status === 'pending') throw error;
    return now.status;
  }
}

export async function answerInChat(
  client: HostClient,
  ref: RequestRef,
  text: string,
): Promise<boolean> {
  const request = await loadQuestion(client, ref);
  const only = request.questions.length === 1 ? request.questions[0] : undefined;
  if (request.status !== 'pending' || only === undefined) return false;
  const answer = { answers: [{ id: only.id, selected: [], custom: text }] };
  return (await answerQuestion(client, ref, answer)) === 'accepted';
}

export interface QuestionDraft {
  selected: string[];
  custom: string;
}

export function emptyDraft(): QuestionDraft {
  return { selected: [], custom: '' };
}

export function toggleOption(
  question: QuestionItem,
  draft: QuestionDraft,
  label: string,
): QuestionDraft {
  if (question.multiSelect === true)
    return {
      ...draft,
      selected: draft.selected.includes(label)
        ? draft.selected.filter((entry) => entry !== label)
        : [...draft.selected, label],
    };
  return { selected: draft.selected[0] === label ? [] : [label], custom: '' };
}

export function typeCustom(
  question: QuestionItem,
  draft: QuestionDraft,
  text: string,
): QuestionDraft {
  return question.multiSelect === true || text.length === 0
    ? { ...draft, custom: text }
    : { selected: [], custom: text };
}

export function buildAnswer(
  questions: readonly QuestionItem[],
  drafts: Readonly<Record<string, QuestionDraft>>,
): QuestionAnswer | undefined {
  const answers = [];
  for (const question of questions) {
    const draft = drafts[question.id] ?? emptyDraft();
    const custom = draft.custom.trim();
    const offered = new Set(question.options?.map((option) => option.label) ?? []);
    const selected = draft.selected.filter((label) => offered.has(label));
    if (question.multiSelect !== true && selected.length > 0)
      answers.push({ id: question.id, selected: selected.slice(0, 1) });
    else if (selected.length === 0 && custom.length === 0) return undefined;
    else
      answers.push({
        id: question.id,
        selected,
        ...(custom.length > 0 ? { custom } : {}),
      });
  }
  return { answers };
}

const PREVIEW_FIELDS = ['command', 'cmd', 'script', 'code', 'url', 'path', 'file_path'];

export function previewInput(input: string): { label: string; value: string } | undefined {
  const rows = readableInput(input);
  return (
    PREVIEW_FIELDS.map((field) => rows.find((row) => row.label === field)).find(
      (row) => row !== undefined,
    ) ?? rows[0]
  );
}

export function readableInput(input: string): { label: string; value: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return [{ label: '', value: input }];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return [{ label: '', value: typeof parsed === 'string' ? parsed : input }];
  return Object.entries(parsed).map(([label, value]) => ({
    label,
    value: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }));
}
