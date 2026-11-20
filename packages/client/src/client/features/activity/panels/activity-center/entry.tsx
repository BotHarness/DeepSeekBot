import type { ReactElement } from 'react';
import type { BridgeActions } from '../../../../actions.js';
import { ActivityCenterView } from '../../../../activity-center-view.js';
import type { DockPanelHost } from '../../../../dock-panels.js';
import type { BotHarnessTranslate } from '../../../../locale.js';

export function renderActivityCenter(
  actions: BridgeActions,
  t: BotHarnessTranslate,
  dockPanels: DockPanelHost | undefined,
): ReactElement {
  return <ActivityCenterView actions={actions} t={t} registry={dockPanels} />;
}
