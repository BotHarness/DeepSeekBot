import { useRef, useState, type ReactElement } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { BotNetworkParticipationSnapshot } from '../../../core/src/devices/bot-network-participation.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { Note } from './ds/note.js';
import { useMountedResource } from './mounted-resource.js';

export function BotNetworkSettings({
  t,
  snapshot,
  fresh,
  onChanged,
}: PropsLocale<'botharness'> & {
  snapshot: BotNetworkParticipationSnapshot;
  fresh: boolean;
  onChanged(): void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController>();
  const mounted = useRef(false);
  const rootRef = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);
  async function change(enabled: boolean, botSlug?: string) {
    if (!fresh || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('./api/botharness/devices/bot-network', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          ...(botSlug === undefined ? {} : { botSlug }),
          confirm: true,
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) throw new Error('network-setting-failed');
      if (mounted.current) onChanged();
    } catch {
      if (mounted.current) {
        setFailed(true);
        onChanged();
      }
    } finally {
      pending.current = undefined;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div ref={rootRef}>
      <SettingsSection
        title={t('devices.botNetwork.title')}
        description={t('devices.botNetwork.scope')}
      >
        <SettingsRow
          title={t('devices.botNetwork.host')}
          description={t('devices.botNetwork.hostHint')}
          control={
            <Switch
              label={t('devices.botNetwork.host')}
              checked={snapshot.enabled}
              disabled={!fresh || busy}
              onChange={(value) => void change(value)}
            />
          }
        />
        {!snapshot.enabled ? <Note>{t('devices.botNetwork.hostOff')}</Note> : null}
        {snapshot.bots.map((bot) => (
          <SettingsRow
            key={bot.botSlug}
            title={bot.displayName}
            control={
              <Switch
                label={bot.displayName}
                checked={bot.enabled}
                disabled={!fresh || busy}
                onChange={(value) => void change(value, bot.botSlug)}
              />
            }
          />
        ))}
        {failed ? <Note tone="danger">{t('devices.botNetwork.failed')}</Note> : null}
      </SettingsSection>
    </div>
  );
}
