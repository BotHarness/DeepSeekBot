import type { BridgeActions } from './actions.js';
import { ActivityCenterView } from './activity-center-view.js';
import { ACTIVITY_CENTER_PANEL, type DockPanel } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import type { NativeSessionCatalog } from './sessions-entry.js';

export function createActivityCenterPanel(
  actions: BridgeActions,
  t: BotHarnessTranslate,
  nativeSessions?: NativeSessionCatalog | undefined,
): DockPanel {
  return {
    id: ACTIVITY_CENTER_PANEL,
    title: t('activityCenter.title'),
    icon: 'bell',
    scope: 'global',
    order: -100,
    defaultPosition: { zone: 'right' },
    component: () => (
      <ActivityCenterView
        actions={actions}
        t={t}
        nativeSessions={nativeSessions}
        placement="panel"
      />
    ),
  };
}
