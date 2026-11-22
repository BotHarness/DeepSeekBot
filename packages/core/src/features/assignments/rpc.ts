import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { AssignmentTimelineLane } from '../../runtime/assignment-timeline.js';
import type { SessionRootRole } from '../../sessions/ownership.js';
import type { HumanAssignmentContext } from '../../runtime/assignment-human-context.js';
import type {
  AssignmentDetail,
  AssignmentActivity,
  AssignmentSummary,
  ChannelAssignmentSummary,
} from '../../runtime/bot-runtime.js';
import type {
  AssignmentAccessPreset,
  AssignmentAccessMode,
} from '../../workspaces/assignment-access.js';
import type { AssignmentsBridgeMethods, SessionProgressEntry } from './methods.js';

export function humanAssignmentContext(
  methods: AssignmentsBridgeMethods,
  slug: string,
  sessionId: string,
  sourceEventId: string,
): { context: HumanAssignmentContext } {
  return unwrap(methods.humanAssignmentContext({ slug, sessionId, sourceEventId }));
}

export function assignments(
  methods: AssignmentsBridgeMethods,
  slug: string,
  query?: string,
  activity?: AssignmentActivity[],
  includeArchived?: boolean,
  limit?: number,
  cursor?: string,
): { assignments: AssignmentSummary[]; nextCursor?: string } {
  return unwrap(
    methods.assignments({
      slug,
      query,
      activity,
      includeArchived,
      limit,
      cursor,
    }),
  );
}

export function channelAssignments(
  methods: AssignmentsBridgeMethods,
  channelId: string,
): {
  assignments: ChannelAssignmentSummary[];
} {
  return unwrap(methods.channelAssignments({ channelId }));
}

export function assignment(
  methods: AssignmentsBridgeMethods,
  slug: string,
  sessionId: string,
): { assignment: AssignmentDetail } {
  return unwrap(methods.assignment({ slug, sessionId }));
}

export function assignmentTimeline(
  methods: AssignmentsBridgeMethods,
  slug: string,
  sessionId: string,
): Promise<{
  assignment: AssignmentDetail;
  lanes: AssignmentTimelineLane[];
  omittedSubagents: number;
}> {
  return unwrapAsync(methods.assignmentTimeline({ slug, sessionId }));
}

export function sessionSubagents(
  methods: AssignmentsBridgeMethods,
  slug: string,
  sessionId: string,
): Promise<{
  sessionId: string;
  role: SessionRootRole;
  lanes: AssignmentTimelineLane[];
  omittedSubagents: number;
}> {
  return unwrapAsync(methods.sessionSubagents({ slug, sessionId }));
}

export function sessionProgress(
  methods: AssignmentsBridgeMethods,
  slug: string,
  sessionIds: readonly string[],
): Promise<{ sessions: SessionProgressEntry[] }> {
  return unwrapAsync(methods.sessionProgress({ slug, sessionIds }));
}

export function assignmentAccessGet(
  methods: AssignmentsBridgeMethods,
  slug: string,
): { preset: AssignmentAccessPreset } {
  return unwrap(methods.assignmentAccessGet({ slug }));
}

export function assignmentAccessSet(
  methods: AssignmentsBridgeMethods,
  slug: string,
  mode: AssignmentAccessMode,
  acknowledgeRisk: boolean,
  scope?: 'chat' | 'assignments',
): { preset: AssignmentAccessPreset } {
  return unwrap(methods.assignmentAccessSet({ slug, mode, acknowledgeRisk, scope }));
}

export const assignmentsRpcMethods = {
  humanAssignmentContext(
    slug: string,
    sessionId: string,
    sourceEventId: string,
  ): { context: HumanAssignmentContext } {
    return humanAssignmentContext(this.methods, slug, sessionId, sourceEventId);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const assignmentRpc = {
  assignments(
    slug: string,
    query?: string,
    activity?: AssignmentActivity[],
    includeArchived?: boolean,
    limit?: number,
    cursor?: string,
  ): { assignments: AssignmentSummary[]; nextCursor?: string } {
    return assignments(this.methods, slug, query, activity, includeArchived, limit, cursor);
  },

  channelAssignments(channelId: string): {
    assignments: ChannelAssignmentSummary[];
  } {
    return channelAssignments(this.methods, channelId);
  },

  assignment(slug: string, sessionId: string): { assignment: AssignmentDetail } {
    return assignment(this.methods, slug, sessionId);
  },

  assignmentTimeline(
    slug: string,
    sessionId: string,
  ): Promise<{
    assignment: AssignmentDetail;
    lanes: AssignmentTimelineLane[];
    omittedSubagents: number;
  }> {
    return assignmentTimeline(this.methods, slug, sessionId);
  },

  sessionSubagents(
    slug: string,
    sessionId: string,
  ): Promise<{
    sessionId: string;
    role: SessionRootRole;
    lanes: AssignmentTimelineLane[];
    omittedSubagents: number;
  }> {
    return sessionSubagents(this.methods, slug, sessionId);
  },

  sessionProgress(
    slug: string,
    sessionIds: readonly string[],
  ): Promise<{ sessions: SessionProgressEntry[] }> {
    return sessionProgress(this.methods, slug, sessionIds);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const assignmentAccessRpc = {
  assignmentAccessGet(slug: string): { preset: AssignmentAccessPreset } {
    return assignmentAccessGet(this.methods, slug);
  },

  assignmentAccessSet(
    slug: string,
    mode: AssignmentAccessMode,
    acknowledgeRisk: boolean,
    scope?: 'chat' | 'assignments',
  ): { preset: AssignmentAccessPreset } {
    return assignmentAccessSet(this.methods, slug, mode, acknowledgeRisk, scope);
  },
} satisfies ThisType<BridgeRpcReceiver>;
