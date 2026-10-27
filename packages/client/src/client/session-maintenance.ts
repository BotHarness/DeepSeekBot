import { useMemo, useSyncExternalStore } from 'react';
import {
  sessionMaintenanceFor,
  type SessionMaintenanceNotice,
} from '../shared/session-maintenance.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
const unavailableOwner = {};

export function useSessionMaintenance(
  actions: Pick<BridgeActions, 'compactBot' | 'newBotSession'> | undefined,
  channelId: string | undefined,
  botSlug: string | undefined,
) {
  const controller = useMemo(
    () =>
      sessionMaintenanceFor(actions ?? unavailableOwner, channelId, actions ? botSlug : undefined, {
        compact: (slug) => actions!.compactBot(slug),
        newSession: (slug) => actions!.newBotSession(slug),
      }),
    [actions, channelId, botSlug],
  );
  return {
    ...controller,
    ...useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot),
  };
}
export function sessionMaintenanceText(
  notice: SessionMaintenanceNotice,
  t: BotHarnessTranslate,
): string {
  const keys = {
    new: 'composerCommand.newSessionDone',
    compacted: 'composerContext.compacted',
    nothing: 'composerContext.compactNothing',
    busy: 'failure.recoveryBusy',
    failed: 'composerCompact.failed',
    unsaved: 'failure.recoveryUnsaved',
    unavailable: 'composerCompact.failed',
  } as const;
  return t(keys[notice]);
}
