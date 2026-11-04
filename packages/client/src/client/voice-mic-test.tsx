import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import { CALL_AUDIO_CONSTRAINTS } from './call-media.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { VoiceSpeechThresholdView } from './voice-bridge.js';
import { levelDbfs, meterFraction, METER_FLOOR_DBFS, smoothLevel } from './voice-level.js';

const styles = stylex.create({
  body: { display: 'grid', gap: space.x3, width: '100%' },
  meter: {
    position: 'relative',
    height: '10px',
    borderRadius: radius.sm,
    backgroundColor: color.well,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width: '0%',
    backgroundColor: color.subtle,
  },
  marker: {
    position: 'absolute',
    insetBlock: '-2px',
    width: '2px',
    marginInlineStart: '-1px',
    backgroundColor: color.accent,
  },
  readout: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x3,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
    fontVariantNumeric: 'tabular-nums',
  },
  slider: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: space.x3,
    fontSize: text.bodySize,
    color: color.fg,
  },
  range: { width: '100%', accentColor: color.accent },
  actions: { display: 'flex', flexWrap: 'wrap', gap: space.x3 },
});

type MicProblem = 'denied' | 'missing' | undefined;

export function VoiceMicTest({
  threshold,
  save,
  t,
}: {
  threshold: VoiceSpeechThresholdView;
  save: ((dbfs: number | null) => Promise<void>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<MicProblem>();
  const [draft, setDraft] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const value = draft ?? threshold.dbfs;
  const limit = useRef(value);
  limit.current = value;
  const fill = useRef<HTMLDivElement | null>(null);
  const readout = useRef<HTMLSpanElement | null>(null);
  const speech = useRef<HTMLSpanElement | null>(null);
  const labels = useRef({ speech: '', quiet: '' });
  labels.current = { speech: t('voice.mic.speech'), quiet: t('voice.mic.quiet') };
  const meterMount = useMountedResource<HTMLDivElement>(() => {
    if (!running) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame = 0;
    const media = globalThis.navigator?.mediaDevices;
    if (media?.getUserMedia === undefined) {
      setProblem('missing');
      setRunning(false);
      return;
    }
    void media
      .getUserMedia({ audio: CALL_AUDIO_CONSTRAINTS, video: false })
      .then((acquired) => {
        if (stopped) {
          for (const track of acquired.getTracks()) track.stop();
          return;
        }
        stream = acquired;
        const audio = new AudioContext();
        context = audio;
        const analyser = audio.createAnalyser();
        analyser.fftSize = 2048;
        audio.createMediaStreamSource(acquired).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let shown = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          const db = levelDbfs(samples);
          shown = smoothLevel(shown, meterFraction(db));
          if (fill.current !== null) fill.current.style.width = `${(shown * 100).toFixed(1)}%`;
          if (readout.current !== null)
            readout.current.textContent = `${Math.max(METER_FLOOR_DBFS, Math.round(db))} dBFS`;
          if (speech.current !== null)
            speech.current.textContent =
              db > limit.current ? labels.current.speech : labels.current.quiet;
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
      })
      .catch((cause: unknown) => {
        if (stopped) return;
        const name = (cause as { name?: unknown } | undefined)?.name;
        setProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'missing');
        setRunning(false);
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      for (const track of stream?.getTracks() ?? []) track.stop();
      void context?.close().catch(() => undefined);
      if (fill.current !== null) fill.current.style.width = '0%';
    };
  }, [running]);
  const commit = (dbfs: number | null) => {
    if (save === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void save(dbfs)
      .then(() => setDraft(undefined))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };
  const marker = `${(meterFraction(value) * 100).toFixed(1)}%`;
  return (
    <SettingsRow
      title={t('voice.mic.title')}
      description={t('voice.mic.description')}
      data={{ 'data-voice-mic-test': '' }}
      control={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setProblem(undefined);
            setRunning(!running);
          }}
        >
          {running ? t('voice.mic.stop') : t('voice.mic.start')}
        </Button>
      }
    >
      <div ref={meterMount} {...stylex.props(styles.body)}>
        <div
          {...stylex.props(styles.meter)}
          role="meter"
          aria-label={t('voice.mic.level')}
          aria-valuemin={METER_FLOOR_DBFS}
          aria-valuemax={0}
        >
          <div ref={fill} {...stylex.props(styles.fill)} />
          <div {...stylex.props(styles.marker)} style={{ insetInlineStart: marker }} />
        </div>
        <div {...stylex.props(styles.readout)}>
          <span ref={readout}>{running ? '…' : t('voice.mic.idle')}</span>
          <span ref={speech} />
        </div>
        <label {...stylex.props(styles.slider)}>
          <span>{t('voice.mic.threshold')}</span>
          <input
            {...stylex.props(styles.range)}
            id="voice-speech-threshold"
            type="range"
            min={threshold.min}
            max={threshold.max}
            step={1}
            value={value}
            disabled={save === undefined || busy}
            onChange={(event) => setDraft(Number(event.currentTarget.value))}
          />
          <span>{t('voice.mic.dbfs', { value })}</span>
        </label>
        <div {...stylex.props(styles.actions)}>
          <Button
            variant="outline"
            size="sm"
            disabled={save === undefined || busy || draft === undefined || draft === threshold.dbfs}
            onClick={() => commit(value)}
          >
            {t('voice.bot.save')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={save === undefined || busy || (!threshold.custom && draft === undefined)}
            onClick={() => commit(null)}
          >
            {t('voice.mic.reset', { value: threshold.defaultDbfs })}
          </Button>
        </div>
        {problem === undefined ? null : (
          <Note tone="danger">
            {problem === 'denied' ? t('voice.mic.denied') : t('voice.mic.missing')}
          </Note>
        )}
        {error === undefined ? null : <Note tone="danger">{error}</Note>}
      </div>
    </SettingsRow>
  );
}
