import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { isAssignmentConcurrencyLimit } from '../bot-mode-settings.js';
import { Note } from './ds/note.js';
import { NumberStepper } from './ds/number-stepper.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessKey } from './locale.js';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x3,
  },
  description: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

export function AssignmentConcurrencySetting({
  t,
  limit,
  writable,
  save,
  variant = 'row',
}: {
  t: (key: BotHarnessKey) => string;
  limit: number;
  writable: boolean;
  save: (limit: number) => Promise<boolean>;
  variant?: 'row' | 'dialog';
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
    if (!isAssignmentConcurrencyLimit(value)) {
      setError('assignmentLimit.invalid');
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
        else setError('assignmentLimit.failed');
      }
    } catch {
      if (mounted.current) setError('assignmentLimit.failed');
    } finally {
      pending.current = false;
      if (mounted.current) {
        setOptimistic(undefined);
        setBusy(false);
      }
    }
  };
  const stepper = (
    <NumberStepper
      label={t('assignmentLimit.title')}
      value={optimistic ?? limit}
      min={1}
      max={32}
      disabled={busy || !writable}
      decreaseLabel={t('common.decrease')}
      increaseLabel={t('common.increase')}
      onChange={(value) => void submit(value)}
    />
  );
  const notes = error ? (
    <Note tone="danger">{t(error)}</Note>
  ) : saved ? (
    <Note>{t('assignmentLimit.saved')}</Note>
  ) : null;
  if (variant === 'dialog')
    return (
      <div ref={mount} {...stylex.props(styles.stack)}>
        <p {...stylex.props(styles.description)}>{t('assignmentLimit.description')}</p>
        {stepper}
        {notes}
      </div>
    );
  return (
    <SettingsRow
      rootRef={mount}
      title={t('assignmentLimit.title')}
      description={t('assignmentLimit.description')}
      control={stepper}
    >
      {notes}
    </SettingsRow>
  );
}
