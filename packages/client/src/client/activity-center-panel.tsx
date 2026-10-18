import { ActivityInboxHeader } from './activity-inbox-menu.js';
import type { BridgeActions } from './actions.js';
import { ActivityCenterView } from './activity-center-view.js';
import { ACTIVITY_CENTER_PANEL, type DockPanel } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';

export function createActivityCenterPanel(
  actions: BridgeActions,
  t: BotHarnessTranslate,
): DockPanel {
  return {
    id: ACTIVITY_CENTER_PANEL,
    title: t('activityCenter.title'),
    icon: 'bell',
    scope: 'global',
    order: -100,
    defaultPosition: { zone: 'right' },
    headerAction: () => <ActivityInboxHeader actions={actions} t={t} />,
    component: () => <ActivityCenterView actions={actions} t={t} placement="panel" />,
  };
}
