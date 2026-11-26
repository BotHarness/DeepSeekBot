import type { ApprovalTemplate } from '@botharness/host-client/bot-settings';

import { t } from '../strings';

export function templateTitle(template: Pick<ApprovalTemplate, 'name' | 'title'>): string {
  if (template.name === 'cautious') return t.autoApprovalCautious;
  if (template.name === 'get-work-done') return t.autoApprovalGetWorkDone;
  return template.title;
}
