import { useRef, useState, type ReactElement } from 'react';

import { isBotHopLimit, MAX_BOT_HOP_LIMIT } from '../bot-mode-settings.js';
import { Note } from './ds/note.js';
import { NumberStepper } from './ds/number-stepper.js';
import { SettingsRow } from './ds/settings-row.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessKey } from './locale.js';

export function BotHopLimitSetting({
  t,
  limit,
  writable,
  save,
}: {
  t: (key: BotHarnessKey) => string;
  limit: number;
  writable: boolean;
  save: (limit: number) => Promise<boolean>;
}): ReactElement {
  const [optimistic, setOptimistic] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BotHarnessKey>();
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submit = async (value: number): Promise<void> => {
    if (pending.current || !writable) return;
    if (!isBotHopLimit(value)) {
      setError('botHopLimit.invalid');
      return;
    }
    pending.current = true;
    setOptimistic(value);
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const accepted = await save(value);
      if (mounted.current) {
        if (accepted) setSaved(true);
        else setError('botHopLimit.failed');
      }
    } catch {
      if (mounted.current) setError('botHopLimit.failed');
    } finally {
      pending.current = false;
      if (mounted.current) {
        setOptimistic(undefined);
        setBusy(false);
      }
    }
  };
  return (
    <SettingsRow
      rootRef={mount}
      title={t('botHopLimit.title')}
      description={t('botHopLimit.description')}
      control={
        <NumberStepper
          label={t('botHopLimit.title')}
          value={optimistic ?? limit}
          min={1}
          max={MAX_BOT_HOP_LIMIT}
          disabled={busy || !writable}
          decreaseLabel={t('common.decrease')}
          increaseLabel={t('common.increase')}
          onChange={(value) => void submit(value)}
        />
      }
    >
      {error ? (
        <Note tone="danger">{t(error)}</Note>
      ) : saved ? (
        <Note>{t('botHopLimit.saved')}</Note>
      ) : null}
    </SettingsRow>
  );
}
