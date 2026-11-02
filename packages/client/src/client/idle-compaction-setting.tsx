import { useRef, useState, type ReactElement } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  loadIdleCompaction,
  setIdleCompaction,
  type BridgeCall,
  type IdleCompactionStatus,
} from './bridge.js';
import { useMountedResource } from './mounted-resource.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';

export type IdleCompactionSettingProps = PropsLocale<'botharness'> &
  InjectFace<{ call: BridgeCall }>;

export function IdleCompactionSetting({ call, t }: IdleCompactionSettingProps): ReactElement {
  const [status, setStatus] = useState<IdleCompactionStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    const version = ++request.current;
    loadIdleCompaction(call, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && version === request.current) setStatus(value);
      })
      .catch(() => {
        if (!controller.signal.aborted && version === request.current) setError(true);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [call]);
  const toggle = async (enabled: boolean): Promise<void> => {
    if (status === undefined) return;
    const previous = status;
    const version = ++request.current;
    setBusy(true);
    setError(false);
    setStatus({ ...status, enabled });
    try {
      const value = await setIdleCompaction(call, enabled);
      if (mounted.current && version === request.current) setStatus(value);
    } catch {
      if (mounted.current && version === request.current) {
        setStatus(previous);
        setError(true);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <SettingsRow
      rootRef={mount}
      title={t('idleCompaction.row.title')}
      description={t('idleCompaction.row.description')}
      data={{ 'data-idle-compaction-setting': '' }}
      control={
        <Switch
          checked={status?.enabled ?? false}
          onChange={(enabled: boolean) => void toggle(enabled)}
          disabled={status === undefined || busy}
          label={t('idleCompaction.row.title')}
        />
      }
    >
      {status?.settingReadable === false ? (
        <Note tone="danger">{t('idleCompaction.row.unreadable')}</Note>
      ) : null}
      {error ? <Note tone="danger">{t('idleCompaction.row.error')}</Note> : null}
    </SettingsRow>
  );
}
