import { useRef, useState, type ReactElement } from 'react';

import { bridgeHost } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ConfirmDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { Switch } from './ds/switch.js';
import {
  MANAGEMENT_CAPABILITIES,
  loadManagementGrants,
  setManagementGrant,
  type ManagementCapability,
  type ManagementGrants,
} from '@botharness/host-client/management-grants';
import { useMountedResource } from './mounted-resource.js';
import { teamErrorText } from './team-settings.js';

export function BotManagementEntry({
  botSlug,
  actions,
  t,
  refreshRevision,
}: ChannelSidebarEntryProps): ReactElement | null {
  const call = actions.teamCall;
  const enabled = call !== undefined && botSlug !== undefined;
  const [grants, setGrants] = useState<ManagementGrants>();
  const [confirming, setConfirming] = useState<ManagementCapability>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [noAppManager, setNoAppManager] = useState(false);
  const request = useRef(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setGrants(undefined);
    loadManagementGrants(bridgeHost(call, controller.signal), botSlug).then(
      (value) => {
        if (!controller.signal.aborted) setGrants(value);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [call, botSlug, enabled, refreshRevision]);
  if (!enabled) return null;
  const apply = (capability: ManagementCapability, on: boolean): void => {
    const current = ++request.current;
    setBusy(true);
    setError(undefined);
    setManagementGrant(bridgeHost(call), botSlug, capability, on).then(
      (change) => {
        if (current !== request.current) return;
        setGrants((value) =>
          value === undefined
            ? value
            : {
                ...value,
                capabilities: change.capabilities,
                appManagers: change.capabilities.includes('manage-app')
                  ? [...new Set([...value.appManagers, botSlug])]
                  : value.appManagers.filter((slug) => slug !== botSlug),
              },
        );
        setNoAppManager(change.noAppManager);
        setConfirming(undefined);
        setBusy(false);
      },
      (failure: unknown) => {
        if (current !== request.current) return;
        setError(teamErrorText(t, failure));
        setBusy(false);
      },
    );
  };
  return (
    <div ref={mount} data-bot-management={botSlug}>
      {grants === undefined ? null : !grants.editable ? (
        <Note>{t('botManagement.ownerOnly')}</Note>
      ) : (
        <SettingsSection>
          {MANAGEMENT_CAPABILITIES.map((capability) => (
            <SettingsRow
              key={capability}
              title={t(`botManagement.${capability}`)}
              description={t(`botManagement.${capability}.hint`)}
              data={{ 'data-bot-management-row': capability }}
              control={
                <Switch
                  label={t(`botManagement.${capability}`)}
                  checked={grants.capabilities.includes(capability)}
                  disabled={busy}
                  onChange={(checked) => {
                    if (checked) {
                      setError(undefined);
                      setConfirming(capability);
                    } else apply(capability, false);
                  }}
                />
              }
            />
          ))}
          {noAppManager ? <Note tone="warning">{t('botManagement.noAppManager')}</Note> : null}
          {error === undefined || confirming !== undefined ? null : (
            <Note tone="danger">{error}</Note>
          )}
        </SettingsSection>
      )}
      {confirming === undefined ? null : (
        <ConfirmDialog
          title={t(`botManagement.${confirming}.confirmTitle`)}
          description={`${t(`botManagement.${confirming}.abilities`)} ${t('botManagement.approval')}`}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('botManagement.turnOn')}
          busy={busy}
          error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
          onCancel={() => {
            request.current++;
            setBusy(false);
            setError(undefined);
            setConfirming(undefined);
          }}
          onConfirm={() => apply(confirming, true)}
        />
      )}
    </div>
  );
}
