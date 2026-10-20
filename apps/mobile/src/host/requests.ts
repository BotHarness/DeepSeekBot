import { approvalShellCommand } from '../../../../packages/client/src/client/approval-diff';
import {
  approveWorkspaceRequest,
  listHostFolders,
  loadWorkspaceOptions,
  resolveWorkspaceFolder,
  type WorkspaceGrant,
} from './bot-settings';
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
  allowAlways: boolean;
  status: RequestStatus;
  outcome?: ToolApprovalOutcome;
  expiresAt?: string;
  execution?: ApprovalExecution;
}

export type ApprovalExecution =
  | 'waiting-human'
  | 'waiting-capacity'
  | 'running'
  | 'settled'
  | 'needs-repair';

export interface QuestionRequest extends RequestRef {
  questions: QuestionItem[];
  status: RequestStatus;
}

export type DecisionResult = 'accepted' | 'decided' | 'expired';

export type ApprovalChoice = 'allowed-once' | 'allowed-always-tool' | 'rejected';

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
  const [{ request, later }, { status, expiresAt, execution }] = await Promise.all([
    readRequest(client, ref),
    client.call<{
      status: ToolApprovalStatus;
      expiresAt?: string;
      execution?: ApprovalExecution;
    }>('toolApprovalStatus', {
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
    allowAlways: card.allowAlways === true,
    status: decision !== undefined ? 'decided' : status === 'pending' ? 'pending' : 'expired',
    ...(decision === undefined ? {} : { outcome: decision.outcome }),
    ...(decision === undefined && typeof expiresAt === 'string' ? { expiresAt } : {}),
    ...(execution === undefined ? {} : { execution }),
  };
}

const handled = new Set<string>();

function handledKey(ref: Pick<RequestRef, 'channelId' | 'messageId'>): string {
  return `${ref.channelId}\n${ref.messageId}`;
}

export function handledHere(ref: Pick<RequestRef, 'channelId' | 'messageId'>): boolean {
  return handled.has(handledKey(ref));
}

function markHandled(ref: RequestRef): void {
  handled.add(handledKey(ref));
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
    markHandled(ref);
    return 'accepted';
  } catch (error) {
    if (!(error instanceof MethodRefused)) throw error;
    const now = await loadApproval(client, ref);
    if (now.status === 'pending') throw error;
    return now.status;
  }
}

export interface GrantRequest extends RequestRef {
  reason: string;
  status: 'pending' | 'decided';
}

export async function loadGrantRequest(client: HostClient, ref: RequestRef): Promise<GrantRequest> {
  const { request, later } = await readRequest(client, ref);
  if (
    request.grantRequest !== true ||
    (request.author !== undefined &&
      (request.author.kind !== 'bot' || request.author.slug !== ref.botSlug))
  )
    throw new Error('This message is not a folder request.');
  const decided =
    request.grantRequestResolved === true ||
    later.some((entry) => entry.grantRequestResolution?.requestMessageId === ref.messageId);
  return { ...ref, reason: request.body, status: decided ? 'decided' : 'pending' };
}

export async function decideGrantRequest(
  client: HostClient,
  ref: RequestRef,
  workspaceId: string,
): Promise<{ result: DecisionResult; grant?: WorkspaceGrant }> {
  try {
    const grant = await approveWorkspaceRequest(
      client,
      ref.botSlug,
      ref.channelId,
      ref.messageId,
      workspaceId,
    );
    markHandled(ref);
    return { result: 'accepted', grant };
  } catch (error) {
    if (!(error instanceof MethodRefused)) throw error;
    const now = await loadGrantRequest(client, ref).catch(() => undefined);
    if (now?.status !== 'decided') throw error;
    return { result: 'decided' };
  }
}

export function grantRequestPort(client: HostClient, ref: RequestRef, after?: () => void) {
  return {
    load: () => loadGrantRequest(client, ref),
    approve: async (workspaceId: string) => {
      const { result } = await decideGrantRequest(client, ref, workspaceId);
      after?.();
      return result;
    },
    listFolders: (path?: string) => listHostFolders(client, path),
    loadWorkspaceOptions: () => loadWorkspaceOptions(client),
    resolveFolder: (path: string) => resolveWorkspaceFolder(client, path),
  };
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
    markHandled(ref);
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

const HOST_APPROVAL_SUMMARY = '请求批准执行 ';

export function approvalSummaryTool(summary: string): string | undefined {
  if (!summary.startsWith(HOST_APPROVAL_SUMMARY)) return undefined;
  const tool = summary.slice(HOST_APPROVAL_SUMMARY.length).trim();
  return tool === '' ? undefined : tool;
}

function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

export function secretCommand(toolName: string, input: string): string | undefined {
  if (toolName !== 'secret_cli') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { program, args } = parsed as { program?: unknown; args?: unknown };
  if (typeof program !== 'string' || program.trim() === '') return undefined;
  const words = Array.isArray(args)
    ? args.filter((arg): arg is string => typeof arg === 'string')
    : [];
  return [program, ...words].map(shellWord).join(' ');
}

export function approvalCommand(toolName: string, input: string): string | undefined {
  return approvalShellCommand(toolName, input)?.command ?? secretCommand(toolName, input);
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
