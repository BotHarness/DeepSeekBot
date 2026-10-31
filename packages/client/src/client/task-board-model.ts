import type {
  AssignmentReportState,
  ChannelAssignmentSummary,
} from '../../../core/src/runtime/bot-runtime.js';
import type { AssignmentWork, AssignmentWorkLane, AssignmentWorkStep } from './bridge.js';
import type { AssignmentNeed, AssignmentSection } from './session-rows.js';
import type { BotSummary } from './store.js';

export const TASK_BOARD_MAX_CARDS = 200;
export const TASK_BOARD_MAX_STEPS = 40;

export type TaskBoardChannelType = 'dm' | 'group';

export interface StepView {
  status: AssignmentWorkStep['status'];
  tool: string;
  detail?: string;
  at: string;
  round?: number;
}

export interface TaskBoardProgress {
  done: number;
  total: number;
  omitted: number;
  running: number;
}

export interface AssignmentCard {
  sessionId: string;
  botSlug: string;
  title: string;
  description: string;
  activity: ChannelAssignmentSummary['activity'];
  section: AssignmentSection;
  needs?: AssignmentNeed;
  createdAt: string;
  updatedAt: string;
  latestReport?: NonNullable<ChannelAssignmentSummary['latestReport']>;
  modelRoute?: NonNullable<ChannelAssignmentSummary['modelRoute']>;
  progress?: TaskBoardProgress;
  currentStep?: StepView;
  steps?: StepView[];
  unavailable?: boolean;
  workError?: string;
}

export interface BotGroup {
  botSlug: string;
  displayName: string;
  avatar?: string;
  collapsed: boolean;
  assignments: AssignmentCard[];
}

export interface TaskBoardModel {
  channelId: string;
  channelType: TaskBoardChannelType;
  loadedAt: number;
  stale: boolean;
  truncated: boolean;
  groups: BotGroup[];
}

export type TaskBoardPhase = 'loading' | 'error' | 'empty' | 'ready';

export interface TaskBoardWorkState {
  work?: AssignmentWork;
  error?: string;
}

export interface TaskBoardViewPrefs {
  collapsedBots?: Readonly<Record<string, boolean>>;
  showDoneSteps?: boolean;
  autoExpandWorking?: boolean;
  onlyWorking?: boolean;
}

export interface TaskBoardInput {
  channelId: string;
  channelType: TaskBoardChannelType;
  assignments: readonly ChannelAssignmentSummary[];
  bots: readonly BotSummary[];
  now: number;
  stale?: boolean;
  availableSessionIds?: ReadonlySet<string>;
  work?: Readonly<Record<string, TaskBoardWorkState>>;
  prefs?: TaskBoardViewPrefs;
}

function timeOf(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function needsWork(section: AssignmentSection): boolean {
  return section === 'working' || section === 'needs-input';
}

export function assignmentPlacement(
  activity: ChannelAssignmentSummary['activity'],
  reportState: AssignmentReportState | undefined,
): { section: AssignmentSection; needs?: AssignmentNeed } {
  if (activity === 'stopped') return { section: 'resolved' };
  if (activity === 'working' || activity === 'stopping') return { section: 'working' };
  if (activity === 'error') return { section: 'needs-input', needs: 'error' };
  if (reportState === 'waiting-human' || reportState === 'blocked' || reportState === 'failed')
    return { section: 'needs-input', needs: reportState };
  return { section: 'idle' };
}

export function taskBoardPhase(
  status: 'loading' | 'ready' | 'error',
  cardCount: number,
): TaskBoardPhase {
  if (status === 'loading') return 'loading';
  if (status === 'error') return cardCount === 0 ? 'error' : 'ready';
  return cardCount === 0 ? 'empty' : 'ready';
}

function mainLaneOf(work: AssignmentWork | undefined): AssignmentWorkLane | undefined {
  return work?.lanes.find((lane) => lane.role === 'main');
}

function stepViewOf(step: AssignmentWorkStep): StepView {
  return {
    status: step.status,
    tool: step.tool,
    at: step.at,
    ...(step.detail === undefined ? {} : { detail: step.detail }),
    ...(step.round === undefined ? {} : { round: step.round }),
  };
}

function progressOf(lane: AssignmentWorkLane | undefined): TaskBoardProgress | undefined {
  if (lane === undefined || lane.entries.length === 0) return undefined;
  let done = 0;
  let running = 0;
  for (const entry of lane.entries) {
    if (entry.status === 'running') running += 1;
    else done += 1;
  }
  return { done, total: lane.entries.length, omitted: lane.omitted, running };
}

function currentStepOf(lane: AssignmentWorkLane | undefined): StepView | undefined {
  if (lane === undefined || lane.entries.length === 0) return undefined;
  const running = lane.entries.findLast((entry) => entry.status === 'running');
  const picked = running ?? lane.entries.at(-1);
  return picked === undefined ? undefined : stepViewOf(picked);
}

function stepsOf(
  lane: AssignmentWorkLane | undefined,
  showDoneSteps: boolean,
): StepView[] | undefined {
  if (lane === undefined || lane.entries.length === 0) return undefined;
  const recent = lane.entries.slice(-TASK_BOARD_MAX_STEPS);
  const visible = showDoneSteps ? recent : recent.filter((entry) => entry.status !== 'done');
  return visible.length === 0 ? undefined : visible.map(stepViewOf);
}

function cardOf(assignment: ChannelAssignmentSummary, input: TaskBoardInput): AssignmentCard {
  const placement = assignmentPlacement(assignment.activity, assignment.latestReport?.state);
  const state = input.work?.[assignment.sessionId];
  const lane = mainLaneOf(state?.work);
  const progress = progressOf(lane);
  const currentStep = currentStepOf(lane);
  const steps = stepsOf(lane, input.prefs?.showDoneSteps ?? true);
  const unavailable =
    input.availableSessionIds !== undefined && !input.availableSessionIds.has(assignment.sessionId);
  return {
    sessionId: assignment.sessionId,
    botSlug: assignment.botSlug,
    title: assignment.title,
    description: assignment.description,
    activity: assignment.activity,
    section: placement.section,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    ...(placement.needs === undefined ? {} : { needs: placement.needs }),
    ...(assignment.latestReport === undefined ? {} : { latestReport: assignment.latestReport }),
    ...(assignment.modelRoute === undefined ? {} : { modelRoute: assignment.modelRoute }),
    ...(progress === undefined ? {} : { progress }),
    ...(currentStep === undefined ? {} : { currentStep }),
    ...(steps === undefined ? {} : { steps }),
    ...(unavailable ? { unavailable: true } : {}),
    ...(state?.error === undefined ? {} : { workError: state.error }),
  };
}

function newestTimeOf(cards: readonly AssignmentCard[]): number {
  const newest = cards[0];
  return newest === undefined ? 0 : timeOf(newest.updatedAt);
}

function groupsOf(cards: readonly AssignmentCard[], input: TaskBoardInput): BotGroup[] {
  const bySlug = new Map<string, AssignmentCard[]>();
  for (const card of cards) {
    const existing = bySlug.get(card.botSlug);
    if (existing === undefined) bySlug.set(card.botSlug, [card]);
    else existing.push(card);
  }
  const bots = new Map(input.bots.map((bot) => [bot.slug, bot]));
  const autoExpand = input.prefs?.autoExpandWorking ?? false;
  const groups = [...bySlug].map(([botSlug, assignments]) => {
    const bot = bots.get(botSlug);
    const remembered = input.prefs?.collapsedBots?.[botSlug];
    const active = autoExpand && assignments.some((card) => needsWork(card.section));
    const collapsed = active ? false : (remembered ?? input.channelType === 'group');
    return {
      botSlug,
      displayName: bot?.displayName ?? botSlug,
      ...(bot?.avatar === undefined ? {} : { avatar: bot.avatar }),
      collapsed,
      assignments,
    };
  });
  return groups.sort(
    (left, right) =>
      newestTimeOf(right.assignments) - newestTimeOf(left.assignments) ||
      left.botSlug.localeCompare(right.botSlug),
  );
}

export function buildTaskBoard(input: TaskBoardInput): TaskBoardModel {
  const onlyWorking = input.prefs?.onlyWorking ?? false;
  const cards = input.assignments
    .map((assignment) => cardOf(assignment, input))
    .filter((card) => !onlyWorking || needsWork(card.section))
    .sort(
      (left, right) =>
        timeOf(right.updatedAt) - timeOf(left.updatedAt) ||
        left.sessionId.localeCompare(right.sessionId),
    );
  const truncated = cards.length > TASK_BOARD_MAX_CARDS;
  return {
    channelId: input.channelId,
    channelType: input.channelType,
    loadedAt: input.now,
    stale: input.stale === true,
    truncated,
    groups: groupsOf(truncated ? cards.slice(0, TASK_BOARD_MAX_CARDS) : cards, input),
  };
}
