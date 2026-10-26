import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  loadIdleCompaction,
  setCompactionThreshold,
  type BridgeCall,
  type CompactionThreshold,
} from './bridge.js';
import { FieldStack, TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { useMountedResource } from './mounted-resource.js';

export type CompactionThresholdSettingProps = PropsLocale<'botharness'> &
  InjectFace<{ call: BridgeCall }>;

interface Draft {
  percent: string;
  headroom: string;
}

function draftOf(threshold: CompactionThreshold): Draft {
  return {
    percent: String(Number((threshold.ratio * 100).toFixed(2))),
    headroom: String(threshold.headroomTokens),
  };
}

export function CompactionThresholdSetting({
  call,
  t,
}: CompactionThresholdSettingProps): ReactElement {
  const [threshold, setThreshold] = useState<CompactionThreshold>();
  const [draft, setDraft] = useState<Draft>({ percent: '', headroom: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const accept = (value: CompactionThreshold | undefined): void => {
    setThreshold(value);
    if (value !== undefined) setDraft(draftOf(value));
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    loadIdleCompaction(call, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) accept(value.threshold);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [call]);
  const percent = Number(draft.percent);
  const headroom = Number(draft.headroom);
  const percentMin = Math.round((threshold?.ratioRange.min ?? 0) * 100);
  const percentMax = Math.round((threshold?.ratioRange.max ?? 1) * 100);
  const percentInvalid =
    threshold !== undefined &&
    (draft.percent === '' ||
      !Number.isFinite(percent) ||
      percent < percentMin ||
      percent > percentMax);
  const headroomInvalid =
    threshold !== undefined &&
    (!Number.isInteger(headroom) ||
      headroom < threshold.headroomRange.min ||
      headroom > threshold.headroomRange.max);
  const changed =
    threshold !== undefined &&
    (percent / 100 !== threshold.ratio || headroom !== threshold.headroomTokens);
  const save = async (next: {
    thresholdRatio?: number | null;
    headroomTokens?: number | null;
  }): Promise<void> => {
    setBusy(true);
    setError(false);
    try {
      const value = await setCompactionThreshold(call, next);
      if (mounted.current) accept(value.threshold);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <SettingsRow
      rootRef={mount}
      title={t('compactionThreshold.row.title')}
      description={t('compactionThreshold.row.description')}
      data={{ 'data-compaction-threshold-setting': '' }}
    >
      {threshold === undefined ? null : (
        <FieldStack>
          <TextField
            label={t('compactionThreshold.ratio')}
            hint={t('compactionThreshold.ratio.hint', {
              min: percentMin,
              max: percentMax,
              value: Math.round(threshold.ratioRange.defaultValue * 100),
            })}
            error={
              percentInvalid
                ? t('compactionThreshold.ratio.invalid', { min: percentMin, max: percentMax })
                : undefined
            }
            inputMode="numeric"
            value={draft.percent}
            onChange={(percent) => setDraft({ ...draft, percent: percent.trim() })}
            data-compaction-threshold-ratio=""
          />
          <TextField
            label={t('compactionThreshold.headroom')}
            hint={t('compactionThreshold.headroom.hint', {
              min: threshold.headroomRange.min,
              max: threshold.headroomRange.max,
              value: threshold.headroomRange.defaultValue,
            })}
            error={
              headroomInvalid
                ? t('compactionThreshold.invalid', {
                    min: threshold.headroomRange.min,
                    max: threshold.headroomRange.max,
                  })
                : undefined
            }
            inputMode="numeric"
            value={draft.headroom}
            onChange={(headroom) => setDraft({ ...draft, headroom: headroom.trim() })}
            data-compaction-threshold-headroom=""
          />
          <div>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !changed || percentInvalid || headroomInvalid}
              onClick={() =>
                void save({
                  ...(percent / 100 === threshold.ratio ? {} : { thresholdRatio: percent / 100 }),
                  ...(headroom === threshold.headroomTokens ? {} : { headroomTokens: headroom }),
                })
              }
            >
              {t('compactionThreshold.save')}
            </Button>
            {threshold.ratioSet || threshold.headroomSet ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void save({ thresholdRatio: null, headroomTokens: null })}
              >
                {t('compactionThreshold.reset')}
              </Button>
            ) : null}
          </div>
        </FieldStack>
      )}
      {error ? <Note tone="danger">{t('compactionThreshold.error')}</Note> : null}
    </SettingsRow>
  );
}
