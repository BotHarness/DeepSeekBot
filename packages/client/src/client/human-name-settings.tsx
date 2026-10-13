import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import {
  loadHumanIdentity,
  setHumanDefaultName,
  type BridgeCall,
  type LocalHumanIdentity,
} from './bridge.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import type { ClientStore } from './store.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  field: {
    boxSizing: 'border-box',
    width: '200px',
    maxWidth: '100%',
    minWidth: 0,
  },
});

export type HumanNameSettingsProps = PropsLocale<'botharness'> &
  InjectFace<{
    call: BridgeCall;
    store: ClientStore;
    onSaved(): Promise<void>;
  }>;

export function HumanNameSettings({
  call,
  store,
  onSaved,
  t,
}: HumanNameSettingsProps): ReactElement {
  const [identity, setIdentity] = useState<LocalHumanIdentity>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const submitting = useRef(false);
  const request = useRef(0);
  const mounted = useRef(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    const refresh = async (): Promise<void> => {
      if (submitting.current) return;
      const version = ++request.current;
      try {
        const value = await loadHumanIdentity(call, controller.signal);
        if (controller.signal.aborted || version !== request.current) return;
        setIdentity(value);
        if (!dirty.current) setDraft(value.defaultDisplayName ?? '');
        setError(false);
      } catch {
        if (!controller.signal.aborted && version === request.current) setError(true);
      }
    };
    void refresh();
    let stopLive: (() => void) | undefined;
    let channels = store.getSnapshot().channels;
    const sync = (): void => {
      const snapshot = store.getSnapshot();
      if (snapshot.mode === 'bot') {
        stopLive?.();
        stopLive = undefined;
      } else stopLive ??= subscribeMessagingDefaults(() => void refresh());
      if (channels !== snapshot.channels) {
        channels = snapshot.channels;
        void refresh();
      }
    };
    const unsubscribe = store.subscribe(sync);
    sync();
    return () => {
      mounted.current = false;
      controller.abort();
      unsubscribe();
      stopLive?.();
    };
  }, [call, store]);
  const save = async (name: string | null): Promise<void> => {
    if (submitting.current) return;
    submitting.current = true;
    request.current += 1;
    setBusy(true);
    setError(false);
    setSaved(false);
    try {
      const value = await setHumanDefaultName(call, name);
      if (!mounted.current) return;
      setIdentity(value);
      setDraft(value.defaultDisplayName ?? '');
      dirty.current = false;
      setSaved(true);
      void onSaved().catch(() => undefined);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const current = identity?.defaultDisplayName ?? '';
  const commit = (): void => {
    if (identity === undefined || draft.trim() === current) return;
    void save(draft.trim() || null);
  };
  return (
    <SettingsRow
      rootRef={mount}
      title={<label htmlFor="bh-human-default-name">{t('humanName.title')}</label>}
      description={t('humanName.description')}
      data={{ 'data-human-name-setting': '' }}
      control={
        <>
          {identity?.defaultDisplayName === null || identity === undefined ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void save(null)}
            >
              {t('humanName.clear')}
            </Button>
          )}
          <Input
            className={stylex.props(styles.field).className ?? ''}
            id="bh-human-default-name"
            value={draft}
            placeholder={t('humanName.placeholder')}
            maxLength={128}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              commit();
            }}
            onBlur={commit}
            disabled={busy || identity === undefined}
            onChange={(event) => {
              dirty.current = true;
              setDraft(event.target.value);
              setSaved(false);
            }}
          />
        </>
      }
    >
      {error ? (
        <Note tone="danger">{t('humanName.error')}</Note>
      ) : identity === undefined ? (
        <Note>{t('humanName.loading')}</Note>
      ) : saved ? (
        <Note tone="success">{t('humanName.saved')}</Note>
      ) : null}
    </SettingsRow>
  );
}
