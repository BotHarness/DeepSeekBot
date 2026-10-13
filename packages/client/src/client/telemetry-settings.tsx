import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  loadTelemetryStatus,
  setTelemetryPreference,
  type BridgeCall,
  type TelemetryLock,
  type TelemetryStatus,
} from './bridge.js';
import type { BotHarnessKey } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { color } from './ds/tokens.stylex.js';

const styles = stylex.create({
  link: {
    color: color.accent,
    textDecoration: { default: 'none', ':hover': 'underline' },
  },
});

export type TelemetrySettingsProps = PropsLocale<'botharness'> & InjectFace<{ call: BridgeCall }>;

const LOCK_NOTES: Record<TelemetryLock, BotHarnessKey> = {
  config: 'telemetry.row.lockedConfig',
  DO_NOT_TRACK: 'telemetry.row.lockedDoNotTrack',
  BOTHARNESS_TELEMETRY: 'telemetry.row.lockedEnv',
};

export function TelemetrySettings({ call, t }: TelemetrySettingsProps): ReactElement {
  const [status, setStatus] = useState<TelemetryStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    const version = ++request.current;
    loadTelemetryStatus(call, controller.signal)
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
    if (status === undefined || status.lockedBy !== undefined) return;
    const previous = status;
    const version = ++request.current;
    setBusy(true);
    setError(false);
    setStatus({ ...status, enabled, preference: enabled });
    try {
      const value = await setTelemetryPreference(call, enabled);
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
  const lockedBy = status?.lockedBy;
  return (
    <SettingsRow
      rootRef={mount}
      title={t('telemetry.row.title')}
      description={
        <>
          {t('telemetry.row.description')}{' '}
          <a
            href={t('telemetry.notice.privacyUrl')}
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(styles.link)}
          >
            {t('telemetry.row.privacy')}
          </a>
        </>
      }
      data={{ 'data-telemetry-setting': '' }}
      control={
        <Switch
          checked={status?.enabled ?? false}
          onChange={(enabled: boolean) => void toggle(enabled)}
          disabled={status === undefined || busy || lockedBy !== undefined}
          label={t('telemetry.row.title')}
        />
      }
    >
      {lockedBy === undefined ? null : (
        <span data-telemetry-lock={lockedBy}>
          <Note>{t(LOCK_NOTES[lockedBy])}</Note>
        </span>
      )}
      {error ? <Note tone="danger">{t('telemetry.row.error')}</Note> : null}
    </SettingsRow>
  );
}
