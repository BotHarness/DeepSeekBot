import { useSyncExternalStore } from 'react';
import type { BotHarnessTranslate } from './locale.js';
import {
  ACTIVITY_INDICATOR_SCOPES,
  activityIndicatorPreference,
  parseActivityIndicatorScope,
} from './activity-indicator.js';
import { usePanelMenu } from './panel-menu.js';

const labels = {
  all: 'activityInbox.all',
  action: 'activityInbox.needsYou',
  replies: 'activityInbox.forYou',
  unread: 'humanInbox.unread',
  none: 'activityIndicator.none',
} as const;

export function useActivityIndicatorMenu(t: BotHarnessTranslate) {
  const preference = useSyncExternalStore(
    activityIndicatorPreference.subscribe,
    activityIndicatorPreference.getSnapshot,
  );
  const menu = usePanelMenu({
    selectedId: preference.scope,
    items: [
      { type: 'label', id: 'indicator-scope', text: t('activityIndicator.scope') },
      ...ACTIVITY_INDICATOR_SCOPES.map((scope) => ({ id: scope, label: t(labels[scope]) })),
      ...(preference.saveFailed
        ? [{ type: 'label' as const, id: 'save-error', text: t('activityIndicator.saveFailed') }]
        : []),
    ],
    onSelect: (id) => activityIndicatorPreference.set(parseActivityIndicatorScope(id)),
  });
  return { ...menu, scope: preference.scope };
}
