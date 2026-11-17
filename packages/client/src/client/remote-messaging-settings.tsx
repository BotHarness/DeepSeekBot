import type { HostClient } from '@botharness/host-client/client';
import { useMemo, useSyncExternalStore, type ReactElement } from 'react';

import { BotHopLimitRow, GroupAutoAcceptSetting } from './bot-mode-setting-rows.js';
import { BotModePrefs, botModePrefsFace, type BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { SettingsRows, SettingsSection } from './ds/settings-row.js';
import { HumanNameSettings } from './human-name-settings.js';
import type { BotHarnessTranslate } from './locale.js';
import { MessagingDefaultsSettings } from './messaging-defaults-settings.js';
import { useMountedResource } from './mounted-resource.js';
import { remoteBotModeScope } from './remote-bot-mode-scope.js';
import { remoteHostSettings } from './remote-host-actions.js';

function remoteMessaging(client: HostClient) {
  const settings = remoteHostSettings(client);
  const prefs = new BotModePrefs();
  const scope = remoteBotModeScope(settings.call);
  const source = prefs.source;
  return {
    settings,
    prefs,
    scope,
    face: botModePrefsFace(prefs),
    useBotModePrefs<T>(selector: (value: BotModePrefsSnapshot) => T): T {
      return selector(useSyncExternalStore(source.subscribe, source.getSnapshot));
    },
  };
}

export function RemoteMessagingSettings({
  client,
  t,
}: {
  client: HostClient;
  t: BotHarnessTranslate;
}): ReactElement {
  const remote = useMemo(() => remoteMessaging(client), [client]);
  const mount = useMountedResource<HTMLDivElement>(() => {
    remote.prefs.attach(remote.scope);
    void remote.scope.refresh().catch(() => undefined);
    return () => remote.prefs.dispose();
  }, [remote]);
  const rows = { ...remote.face, useBotModePrefs: remote.useBotModePrefs, t };
  return (
    <SettingsRows rootRef={mount}>
      <SettingsSection title={t('remoteHosts.messaging.me')}>
        <HumanNameSettings
          call={remote.settings.call}
          store={remote.settings.store}
          onSaved={async () => undefined}
          t={t}
        />
      </SettingsSection>
      <SettingsSection title={t('remoteHosts.messaging.bots')}>
        <GroupAutoAcceptSetting {...rows} />
        <BotHopLimitRow {...rows} />
      </SettingsSection>
      <MessagingDefaultsSettings call={remote.settings.call} t={t} />
    </SettingsRows>
  );
}
