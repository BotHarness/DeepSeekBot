import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  groupTimeline,
  laneLabel,
  loadAssignmentTimeline,
  type AssignmentTimeline,
  type AssignmentTimelineEntry,
  type AssignmentTimelineLane,
  type AssignmentTimelineRound,
} from '../../host/assignment-timeline';
import { errorText } from '../../host/bot-settings';
import type { HostClient } from '../../host/client';
import { MethodRefused } from '../../host/client';
import { useHostSession } from '../../host/host-session';
import { useDesignTheme } from '../design/theme';
import { edge, radius, rowGlyph, space } from '../design/tokens';
import { DrawerHeader } from '../primitives/drawer-header';
import { SheetScreen } from '../primitives/sheet-screen';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { AssignmentActivityIcon, assignmentTone, StepMark, STEP_MARK } from './assignment-marks';
import { SheetFailed, SheetLoading, SheetNote } from './sheet';

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function stepTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay(at, now)
    ? time
    : `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

function Heading({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      variant="meta"
      tone="muted"
      strong
      style={{ paddingTop: space.x5, paddingBottom: space.x3 }}
    >
      {children}
    </Text>
  );
}

function Group({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        backgroundColor: theme.layer.raised.fill,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Step({ entry, last }: { entry: AssignmentTimelineEntry; last: boolean }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const summary = t.assignmentDetail.stepKind[entry.kind];
  const detail = entry.detail ?? entry.tool;
  const time = stepTime(entry.at);
  return (
    <View
      testID="assignment-step"
      accessible
      accessibilityLabel={[t.assignmentDetail.stepState[entry.status], summary, detail, time]
        .filter((part) => part !== '')
        .join(', ')}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        borderBottomWidth: last ? 0 : edge.hairline,
        borderBottomColor: theme.color.divider,
      }}
    >
      <View style={{ paddingTop: (theme.type.body.line - STEP_MARK) / 2 }}>
        <StepMark status={entry.status} />
      </View>
      <View style={{ flex: 1, gap: space.x1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x3 }}>
          <Text numberOfLines={1} style={{ flex: 1 }}>
            {summary}
          </Text>
          <Text variant="meta" tone="muted">
            {time}
          </Text>
        </View>
        <Text
          variant="meta"
          tone={entry.status === 'failed' ? 'danger' : 'muted'}
          numberOfLines={2}
        >
          {entry.status === 'running' || entry.status === 'done'
            ? detail
            : `${t.assignmentDetail.stepState[entry.status]} · ${detail}`}
        </Text>
      </View>
    </View>
  );
}

function Lane({ lane }: { lane: AssignmentTimelineLane }) {
  const t = useStrings();
  return (
    <View testID={`assignment-lane-${lane.role}-${lane.index}`}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: space.x2,
          paddingTop: space.x4,
          paddingBottom: space.x2,
        }}
      >
        <Text accessibilityRole="header" variant="meta" strong>
          {laneLabel(lane)}
        </Text>
        {lane.role === 'main' || lane.title === undefined ? null : (
          <Text variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {lane.title}
          </Text>
        )}
      </View>
      <Group>
        {lane.omitted === 0 ? null : (
          <Text
            variant="meta"
            tone="muted"
            style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}
          >
            {t.assignmentDetail.olderSteps(lane.omitted)}
          </Text>
        )}
        {lane.entries.length === 0 ? (
          <Text tone="muted" style={{ paddingHorizontal: space.x5, paddingVertical: space.x4 }}>
            {t.assignmentDetail.noSteps}
          </Text>
        ) : (
          lane.entries.map((entry, index) => (
            <Step
              key={`${entry.at}:${index}`}
              entry={entry}
              last={index === lane.entries.length - 1}
            />
          ))
        )}
      </Group>
    </View>
  );
}

function RoundHeading({ round }: { round: AssignmentTimelineRound | undefined }) {
  const t = useStrings();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        gap: space.x2,
        paddingTop: space.x5,
      }}
    >
      <Text accessibilityRole="header" strong>
        {round === undefined ? t.assignmentDetail.earlier : t.assignmentDetail.round(round.index)}
      </Text>
      {round === undefined ? null : (
        <Text variant="meta" tone="muted">
          {[t.assignmentDetail.roundKind[round.kind], stepTime(round.at)]
            .filter((part) => part !== '')
            .join(' · ')}
        </Text>
      )}
    </View>
  );
}

function Instruction({ text }: { text: string }) {
  const t = useStrings();
  return (
    <View style={{ paddingTop: space.x3 }}>
      <Group>
        <View
          testID="assignment-instruction"
          style={{ paddingHorizontal: space.x5, paddingVertical: space.x4, gap: space.x1 }}
        >
          <Text variant="meta" tone="muted">
            {t.assignmentDetail.instruction}
          </Text>
          <Text selectable>{text}</Text>
        </View>
      </Group>
    </View>
  );
}

export function AssignmentDetail({ timeline }: { timeline: AssignmentTimeline }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { assignment } = timeline;
  const report = assignment.latestReport;
  const main = timeline.lanes.find((lane) => lane.role === 'main');
  return (
    <View style={{ paddingHorizontal: space.x5 }}>
      <View
        testID="assignment-status"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: space.x2,
          paddingHorizontal: space.x3,
          paddingVertical: space.x1,
          borderRadius: radius.round,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <AssignmentActivityIcon activity={assignment.activity} size={rowGlyph.size} />
        <Text variant="meta" tone={assignmentTone(assignment.activity)} strong>
          {t.profileAssignmentState[assignment.activity]}
        </Text>
      </View>
      <Text accessibilityRole="header" variant="title" selectable style={{ paddingTop: space.x3 }}>
        {assignment.title}
      </Text>
      {assignment.description === undefined || assignment.description.trim() === '' ? null : (
        <Text tone="muted" selectable style={{ paddingTop: space.x2 }}>
          {assignment.description}
        </Text>
      )}
      {report === undefined ? null : (
        <>
          <Heading>{t.assignmentDetail.report}</Heading>
          <Group>
            <View
              testID="assignment-report"
              style={{ paddingHorizontal: space.x5, paddingVertical: space.x4, gap: space.x2 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x3 }}>
                <Text
                  variant="meta"
                  strong
                  tone={
                    report.state === 'failed'
                      ? 'danger'
                      : report.state === 'blocked' || report.state === 'waiting-human'
                        ? 'warning'
                        : 'muted'
                  }
                  style={{ flex: 1 }}
                >
                  {t.assignmentDetail.reportState[report.state]}
                </Text>
                <Text variant="meta" tone="muted">
                  {stepTime(report.at)}
                </Text>
              </View>
              <Text selectable>{report.summary}</Text>
            </View>
          </Group>
        </>
      )}
      <Heading>{t.assignmentDetail.timeline}</Heading>
      {timeline.omittedRounds === 0 ? null : (
        <Text variant="meta" tone="muted">
          {t.assignmentDetail.olderRounds(timeline.omittedRounds)}
        </Text>
      )}
      {groupTimeline(timeline).map((group, index) => (
        <View
          key={group.round?.index ?? 'earlier'}
          testID={`assignment-round-${group.round?.index ?? 'earlier'}`}
        >
          {group.round === undefined && timeline.rounds.length === 0 ? null : (
            <RoundHeading round={group.round} />
          )}
          {group.round?.instruction === undefined ? null : (
            <Instruction text={group.round.instruction} />
          )}
          {main === undefined ? null : (
            <Lane
              lane={{ ...main, entries: group.main, omitted: index === 0 ? main.omitted : 0 }}
            />
          )}
          {group.subagents.map((lane) => (
            <Lane key={lane.sessionId} lane={lane} />
          ))}
        </View>
      ))}
      {timeline.omittedSubagents === 0 ? null : (
        <Text variant="meta" tone="muted" style={{ paddingTop: space.x3 }}>
          {t.assignmentDetail.olderSubagents(timeline.omittedSubagents)}
        </Text>
      )}
      <Text
        testID="assignment-ask-in-chat"
        variant="meta"
        tone="muted"
        style={{ paddingTop: space.x5 }}
      >
        {t.assignmentDetail.askInChat}
      </Text>
    </View>
  );
}

export function AssignmentScreenBody({
  client,
  slug,
  sessionId,
}: {
  client: HostClient;
  slug: string;
  sessionId: string;
}) {
  const t = useStrings();
  const insets = useSafeAreaInsets();
  const [timeline, setTimeline] = useState<AssignmentTimeline>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadAssignmentTimeline(client, slug, sessionId).then(
        (next) => {
          if (!live) return;
          setTimeline(next);
          setError(undefined);
        },
        (cause: unknown) => {
          if (!live) return;
          setError(
            cause instanceof MethodRefused && cause.code === 'not-found'
              ? t.assignmentDetail.notFound
              : errorText(cause),
          );
        },
      );
      return () => {
        live = false;
      };
    }, [client, slug, sessionId, t, attempt]),
  );
  return (
    <>
      <View style={{ paddingHorizontal: space.x5, paddingTop: space.x3, paddingBottom: space.x3 }}>
        <DrawerHeader
          title={timeline?.assignment.title ?? t.assignmentDetail.title}
          onClose={() => router.back()}
        />
      </View>
      {timeline === undefined ? (
        error === undefined ? (
          <SheetLoading />
        ) : (
          <SheetFailed message={error} onRetry={() => setAttempt((value) => value + 1)} />
        )
      ) : (
        <ScrollView
          testID="assignment-detail"
          contentContainerStyle={{ paddingTop: space.x3, paddingBottom: insets.bottom + space.x6 }}
        >
          <AssignmentDetail timeline={timeline} />
        </ScrollView>
      )}
    </>
  );
}

export function AssignmentScreen() {
  const t = useStrings();
  const { slug, id, session } = useLocalSearchParams<{
    slug: string;
    id: string;
    session?: string;
  }>();
  const sessionId = session ?? id;
  const { client } = useHostSession();
  return (
    <SheetScreen>
      {client === undefined || slug === undefined || sessionId === undefined ? (
        <SheetNote>{t.noBot}</SheetNote>
      ) : (
        <AssignmentScreenBody client={client} slug={slug} sessionId={sessionId} />
      )}
    </SheetScreen>
  );
}
