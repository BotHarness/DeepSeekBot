import { useRef, useState, type ReactElement } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { loadPublicChannels, setChannelPublic } from './team-bridge.js';
import { useTeamMode } from './team-state.js';

export function ChannelPublicSetting({
  call,
  channelId,
  t,
}: {
  readonly call: BridgeCall;
  readonly channelId: string;
  readonly t: BotHarnessTranslate;
}): ReactElement | null {
  const team = useTeamMode(call);
  const [open, setOpen] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    const version = ++request.current;
    loadPublicChannels(call, controller.signal)
      .then((channels) => {
        if (controller.signal.aborted || version !== request.current) return;
        setOpen(channels.some((channel) => channel.channelId === channelId));
      })
      .catch(() => {
        if (!controller.signal.aborted && version === request.current) setError(true);
      });
    return () => controller.abort();
  }, [call, channelId]);
  if (team?.enabled !== true || team.viewer.kind !== 'owner') return null;
  const toggle = (next: boolean): void => {
    const version = ++request.current;
    setBusy(true);
    setError(false);
    setChannelPublic(call, channelId, next)
      .then(() => {
        if (version === request.current) setOpen(next);
      })
      .catch(() => {
        if (version === request.current) setError(true);
      })
      .finally(() => setBusy(false));
  };
  return (
    <SettingsRow
      rootRef={mount}
      title={t('team.channelPublic.title')}
      description={t('team.channelPublic.description')}
      data={{ 'data-team-row': 'channel-public' }}
      control={
        <Switch
          checked={open ?? false}
          onChange={toggle}
          disabled={open === undefined || busy}
          label={t('team.channelPublic.title')}
        />
      }
    >
      {error ? <Note tone="danger">{t('team.error.generic')}</Note> : null}
    </SettingsRow>
  );
}
