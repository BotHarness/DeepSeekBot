import { View } from 'react-native';

import type { ProfileAssignment } from '../../host/bot-profile';
import type { AssignmentTimelineStatus } from '../../host/assignment-timeline';
import type { ColorRole } from '../design/resolve-theme';
import { useDesignTheme } from '../design/theme';
import { radius, stateRing } from '../design/tokens';
import { CheckIcon, ClockIcon, CloseIcon, InfoIcon, WorkIcon } from '../shell/icons';

const ACTIVITY = {
  working: { Icon: WorkIcon, tone: 'accent' },
  idle: { Icon: CheckIcon, tone: 'muted' },
  error: { Icon: InfoIcon, tone: 'danger' },
  stopping: { Icon: ClockIcon, tone: 'warning' },
  stopped: { Icon: CloseIcon, tone: 'muted' },
} satisfies Record<ProfileAssignment['activity'], { Icon: typeof WorkIcon; tone: ColorRole }>;

export function assignmentTone(activity: ProfileAssignment['activity']): ColorRole {
  return ACTIVITY[activity].tone;
}

export function AssignmentActivityIcon({
  activity,
  size,
}: {
  activity: ProfileAssignment['activity'];
  size: number;
}) {
  const theme = useDesignTheme();
  const { Icon, tone } = ACTIVITY[activity];
  return <Icon color={theme.color[tone]} size={size} />;
}

const STEP_TONE = {
  running: 'accent',
  done: 'success',
  failed: 'danger',
  denied: 'warning',
  cancelled: 'subtle',
} satisfies Record<AssignmentTimelineStatus, ColorRole>;

export const STEP_MARK = 10;

export function StepMark({ status }: { status: AssignmentTimelineStatus }) {
  const theme = useDesignTheme();
  const color = theme.color[STEP_TONE[status]];
  return (
    <View
      style={{
        width: STEP_MARK,
        height: STEP_MARK,
        borderRadius: radius.round,
        borderWidth: stateRing.width,
        borderColor: color,
        backgroundColor: status === 'running' ? 'transparent' : color,
      }}
    />
  );
}
