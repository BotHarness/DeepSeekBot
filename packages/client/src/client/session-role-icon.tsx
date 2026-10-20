import type { ReactElement } from 'react';
import {
  IconAgentPresetOutlineRegular,
  IconBranchOutlineRegular,
  IconCodeOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import type { ActivitySourceRole } from '../../../core/src/state/tool-activity.js';

const ROLE_ICONS = {
  orchestrator: IconAgentPresetOutlineRegular,
  assignment: IconCodeOutlineRegular,
  subagent: IconBranchOutlineRegular,
};

export function SessionRoleIcon({
  role,
  label,
}: {
  role: ActivitySourceRole;
  label: string;
}): ReactElement {
  const Icon = ROLE_ICONS[role];
  return (
    <Tooltip label={label} side="bottom">
      <span className="bh-session-role-icon" role="img" aria-label={label}>
        <Icon size={16} />
      </span>
    </Tooltip>
  );
}
