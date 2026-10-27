import { Pressable, View } from 'react-native';

import { errorText } from '../../host/bot-settings';
import type { Routines } from '../../host/routines';
import type { BotScheduleSummary, ScheduleTrigger } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { haptic } from '../haptics';
import { confirmDestructive, showAppDialog } from '../primitives/app-dialog';
import { SwipeRow, swipeActionProps, type SwipeAction } from '../primitives/swipe-row';
import { Text } from '../primitives/text';
import { HeaderIconButton } from '../shell/header-icon-button';
import { ChevronRightIcon, PauseIcon, PlayIcon, PlusIcon, TrashIcon } from '../shell/icons';
import { t, useStrings } from '../strings';
import { routineDetail } from './routine-text';

export const ROUTINE_GROUPS = ['daily', 'weekly', 'once', 'other'] as const;
export type RoutineGroup = (typeof ROUTINE_GROUPS)[number];

export type RoutineChanges = Pick<Routines, 'runNow' | 'setEnabled' | 'remove'>;

export function routineGroupOf(trigger: ScheduleTrigger): RoutineGroup {
  if (trigger.kind === 'daily' || trigger.kind === 'weekly' || trigger.kind === 'once')
    return trigger.kind;
  return 'other';
}

function nextRun(routine: BotScheduleSummary): number {
  if (!routine.enabled || routine.nextRunAt === undefined) return Number.POSITIVE_INFINITY;
  const at = Date.parse(routine.nextRunAt);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

export function routineGroups(
  routines: readonly BotScheduleSummary[],
): { group: RoutineGroup; routines: BotScheduleSummary[] }[] {
  return ROUTINE_GROUPS.map((group) => ({
    group,
    routines: routines
      .filter((routine) => routineGroupOf(routine.trigger) === group)
      .sort((a, b) => nextRun(a) - nextRun(b)),
  })).filter((entry) => entry.routines.length > 0);
}

export function routineSwipeActions(
  routine: BotScheduleSummary,
  changes: RoutineChanges,
  onChanged: () => void,
): SwipeAction[] {
  const change = (work: () => Promise<unknown>) =>
    void work().then(
      () => {
        haptic('submit');
        onChanged();
      },
      (cause: unknown) => {
        showAppDialog(t.routineFailed, errorText(cause), [{ text: t.done }]);
        onChanged();
      },
    );
  return [
    {
      key: 'run',
      label: t.routineRunNow,
      tone: 'accent',
      icon: PlayIcon,
      run: () => change(() => changes.runNow(routine.id)),
    },
    {
      key: routine.enabled ? 'pause' : 'resume',
      label: routine.enabled ? t.routinePause : t.routineResume,
      tone: 'warning',
      icon: routine.enabled ? PauseIcon : PlayIcon,
      run: () => change(() => changes.setEnabled(routine.id, !routine.enabled)),
    },
    {
      key: 'delete',
      label: t.routineDelete,
      tone: 'danger',
      icon: TrashIcon,
      run: () =>
        confirmDestructive(
          t.routineDeleteConfirm(routine.title),
          t.routineDeleteHint,
          t.routineDelete,
          () => change(() => changes.remove(routine.id)),
        ),
    },
  ];
}

export function NewRoutineButton({ onPress }: { onPress(): void }) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <HeaderIconButton label={t.routineNew} testID="profile-routine-new" onPress={onPress}>
      <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
    </HeaderIconButton>
  );
}

function RoutineRow({
  routine,
  last,
  onOpen,
  actions,
}: {
  routine: BotScheduleSummary;
  last: boolean;
  onOpen: ((routine: BotScheduleSummary) => void) | undefined;
  actions: readonly SwipeAction[];
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const detail = routineDetail(routine);
  return (
    <SwipeRow actions={actions} testID={`profile-routine-swipe-${routine.id}`}>
      <Pressable
        testID={`profile-routine-${routine.id}`}
        accessibilityRole={onOpen === undefined ? undefined : 'button'}
        accessibilityLabel={
          onOpen === undefined
            ? `${routine.title}, ${detail}`
            : `${t.routineOpen(routine.title)}, ${detail}`
        }
        disabled={onOpen === undefined && actions.length === 0}
        onPress={() => onOpen?.(routine)}
        {...swipeActionProps(routine.title, actions)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          minHeight: theme.touch,
          paddingHorizontal: space.x5,
          paddingVertical: space.x4,
          borderBottomWidth: last ? 0 : edge.hairline,
          borderBottomColor: theme.color.divider,
          backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
        })}
      >
        <View style={{ flex: 1, gap: space.x1 }}>
          <Text numberOfLines={1} tone={routine.enabled ? 'fg' : 'muted'}>
            {routine.title}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={2}>
            {detail}
          </Text>
        </View>
        {onOpen === undefined ? null : (
          <ChevronRightIcon color={theme.color.muted} size={theme.type.title.line} />
        )}
      </Pressable>
    </SwipeRow>
  );
}

export function RoutineGroupCard({
  group,
  routines,
  first,
  changes,
  onOpen,
  onChanged,
}: {
  group: RoutineGroup;
  routines: readonly BotScheduleSummary[];
  first: boolean;
  changes: RoutineChanges | undefined;
  onOpen: ((routine: BotScheduleSummary) => void) | undefined;
  onChanged: () => void;
}) {
  const t = useStrings();
  return (
    <View testID={`profile-routine-group-${group}`}>
      <Text
        accessibilityRole="header"
        variant="meta"
        tone="muted"
        strong
        style={{ paddingTop: first ? 0 : space.x4, paddingBottom: space.x2 }}
      >
        {t.routineGroup[group]}
      </Text>
      <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
        {routines.map((routine, index) => (
          <RoutineRow
            key={routine.id}
            routine={routine}
            last={index === routines.length - 1}
            onOpen={onOpen}
            actions={changes === undefined ? [] : routineSwipeActions(routine, changes, onChanged)}
          />
        ))}
      </View>
    </View>
  );
}
