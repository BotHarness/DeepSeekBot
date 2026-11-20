import { Button } from './ds/button.js';
import { useRef, useState, type ReactElement } from 'react';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  loadIdleCompaction,
  setCompactionThreshold,
  type BridgeCall,
  type CompactionThreshold,
} from './bridge.js';
import { Note } from './ds/note.js';
import { NumberField } from './ds/number-field.js';
import { SettingsRow } from './ds/settings-row.js';
import { useMountedResource } from './mounted-resource.js';

export type CompactionThresholdSettingProps = PropsLocale<'botharness'> &
  InjectFace<{ call: BridgeCall }>;

const percentOf = (ratio: number): number => Number((ratio * 100).toFixed(2));

export function CompactionThresholdSetting({
  call,
  t,
}: CompactionThresholdSettingProps): ReactElement {
  const [threshold, setThreshold] = useState<CompactionThreshold>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    loadIdleCompaction(call, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setThreshold(value.threshold);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [call]);
  const save = async (next: {
    thresholdRatio?: number | null;
    headroomTokens?: number | null;
  }): Promise<void> => {
    setBusy(true);
    setError(false);
    try {
      const value = await setCompactionThreshold(call, next);
      if (mounted.current) setThreshold(value.threshold);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const percentMin = Math.round((threshold?.ratioRange.min ?? 0) * 100);
  const percentMax = Math.round((threshold?.ratioRange.max ?? 1) * 100);
  return (
    <>
      <SettingsRow
        rootRef={mount}
        title={t('compactionThreshold.ratio')}
        description={
          threshold === undefined
            ? undefined
            : t('compactionThreshold.ratio.hint', {
                min: percentMin,
                max: percentMax,
                value: Math.round(threshold.ratioRange.defaultValue * 100),
              })
        }
        info={{
          label: t('compactionThreshold.row.title'),
          text: t('compactionThreshold.row.description'),
        }}
        data={{ 'data-compaction-threshold-setting': '' }}
        control={
          threshold === undefined ? undefined : (
            <NumberField
              label={t('compactionThreshold.ratio')}
              value={percentOf(threshold.ratio)}
              min={percentMin}
              max={percentMax}
              integer={false}
              unit="%"
              disabled={busy}
              onCommit={(percent) => void save({ thresholdRatio: percent / 100 })}
              data={{ 'data-compaction-threshold-ratio': '' }}
            />
          )
        }
      >
        {error ? <Note tone="danger">{t('compactionThreshold.error')}</Note> : null}
      </SettingsRow>
      {threshold === undefined ? null : (
        <SettingsRow
          title={t('compactionThreshold.headroom')}
          description={t('compactionThreshold.headroom.hint', {
            min: threshold.headroomRange.min,
            max: threshold.headroomRange.max,
            value: threshold.headroomRange.defaultValue,
          })}
          control={
            <NumberField
              label={t('compactionThreshold.headroom')}
              value={threshold.headroomTokens}
              min={threshold.headroomRange.min}
              max={threshold.headroomRange.max}
              unit="token"
              disabled={busy}
              onCommit={(headroomTokens) => void save({ headroomTokens })}
              data={{ 'data-compaction-threshold-headroom': '' }}
            />
          }
        />
      )}
      {threshold?.ratioSet || threshold?.headroomSet ? (
        <SettingsRow
          title={t('compactionThreshold.reset.title')}
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void save({ thresholdRatio: null, headroomTokens: null })}
            >
              {t('compactionThreshold.reset')}
            </Button>
          }
        />
      ) : null}
    </>
  );
}
