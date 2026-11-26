import { describe, expect, it } from 'vitest';

import type { ApprovalTemplates } from '@botharness/host-client/bot-settings';
import { effectiveTemplateLabel } from '../src/ui/chat/approval-preset';
import { t } from '../src/ui/strings';

const templates: ApprovalTemplates['templates'] = [
  { name: 'cautious', title: 'Cautious', description: '' },
  { name: 'night', title: 'Night shift', description: '' },
];

describe('Effective Approval Template label', () => {
  it.each([
    [{ templates, selected: 'night', globalDefault: 'cautious' }, 'Night shift'],
    [{ templates, selected: '@global', globalDefault: 'night' }, 'Night shift'],
    [{ templates, selected: '@global', globalDefault: 'cautious' }, t.autoApprovalCautious],
    [{ templates, selected: '@global', globalDefault: null }, t.autoApprovalNone],
    [{ templates, selected: null, globalDefault: 'cautious' }, t.autoApprovalNone],
    [{ templates, selected: 'gone', globalDefault: null }, t.autoApprovalUnavailable('gone')],
  ] satisfies [ApprovalTemplates, string][])('names %j as %s', (presets, label) => {
    expect(effectiveTemplateLabel(presets)).toBe(label);
  });
});
