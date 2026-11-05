import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import {
  micOptions,
  openMicrophone,
  readMicDevice,
  savedMicMissing,
  writeMicDevice,
  type MicOption,
} from './mic-device.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { VoiceSpeechThresholdView } from './voice-bridge.js';
import { levelDbfs, meterFraction, METER_FLOOR_DBFS, smoothLevel } from './voice-level.js';

const styles = stylex.create({
  meterLine: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    minWidth: 0,
    paddingTop: space.x2,
  },
  meter: {
    position: 'relative',
    flexGrow: 1,
    minWidth: 0,
    height: '8px',
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
    insetBlock: 0,
    width: '2px',
    transform: 'translateX(-50%)',
    backgroundColor: color.accent,
  },
  readout: {
    display: 'flex',
    gap: space.x3,
    flexShrink: 0,
    minWidth: '9em',
    justifyContent: 'flex-end',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.muted,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  range: { flexGrow: 1, minWidth: 0, margin: 0, accentColor: color.accent },
});

type MicProblem = 'denied' | 'missing' | undefined;

const SYSTEM_DEFAULT = '\u0000default';

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
  const [device, setDevice] = useState<string | undefined>(() => readMicDevice());
  const [devices, setDevices] = useState<readonly MicOption[]>([]);
  const [fellBack, setFellBack] = useState(false);
  const refreshDevices = () => {
    const media = globalThis.navigator?.mediaDevices;
    if (media?.enumerateDevices === undefined) return;
    void media
      .enumerateDevices()
      .then((list) => {
        const options = micOptions(list);
        setDevices(options);
        const saved = readMicDevice();
        if (savedMicMissing(saved, options)) {
          writeMicDevice(undefined);
          setDevice(undefined);
          setFellBack(true);
        }
      })
      .catch(() => undefined);
  };
  const listMount = useMountedResource<HTMLDivElement>(() => {
    refreshDevices();
    const media = globalThis.navigator?.mediaDevices;
    media?.addEventListener?.('devicechange', refreshDevices);
    return () => media?.removeEventListener?.('devicechange', refreshDevices);
  }, []);
  const value = draft ?? threshold.dbfs;
  const limit = useRef(value);
  limit.current = value;
  const [using, setUsing] = useState<string>();
  const unlocked = useRef<AudioContext | undefined>(undefined);
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
    void openMicrophone(media)
      .then(({ stream: acquired, fellBack: missing }) => {
        if (stopped) {
          for (const track of acquired.getTracks()) track.stop();
          return;
        }
        stream = acquired;
        setUsing(acquired.getAudioTracks()[0]?.label || undefined);
        if (missing) {
          setDevice(undefined);
          setFellBack(true);
        }
        refreshDevices();
        const audio = unlocked.current ?? new AudioContext();
        unlocked.current = undefined;
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
      setUsing(undefined);
      void unlocked.current?.close().catch(() => undefined);
      unlocked.current = undefined;
      cancelAnimationFrame(frame);
      for (const track of stream?.getTracks() ?? []) track.stop();
      void context?.close().catch(() => undefined);
      if (fill.current !== null) fill.current.style.width = '0%';
    };
  }, [running, device]);
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
  const release = () => {
    if (draft !== undefined && draft !== threshold.dbfs) commit(draft);
  };
  return (
    <SettingsSection title={t('voice.mic.section')} description={t('voice.mic.sectionHint')}>
      <SettingsRow
        rootRef={listMount}
        title={t('voice.mic.device')}
        description={
          fellBack
            ? t('voice.mic.fellBack')
            : devices.length > 0 && devices.every((item) => item.label === '')
              ? t('voice.mic.labelsHint')
              : t('voice.mic.deviceHint')
        }
        data={{ 'data-voice-mic-device': '' }}
        control={
          <Select
            label={t('voice.mic.device')}
            value={device ?? SYSTEM_DEFAULT}
            options={[
              { value: SYSTEM_DEFAULT, label: t('voice.mic.systemDefault') },
              ...devices.map((item, index) => ({
                value: item.id,
                label: item.label || t('voice.mic.unnamed', { number: index + 1 }),
              })),
            ]}
            onChange={(next) => {
              const id = next === SYSTEM_DEFAULT ? undefined : next;
              writeMicDevice(id);
              setDevice(id);
              setFellBack(false);
            }}
          />
        }
      />
      <SettingsRow
        rootRef={meterMount}
        title={t('voice.mic.title')}
        description={t('voice.mic.description')}
        data={{ 'data-voice-mic-test': '' }}
        control={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setProblem(undefined);
              if (!running && typeof AudioContext === 'function') {
                const audio = new AudioContext();
                void audio.resume().catch(() => undefined);
                unlocked.current = audio;
              }
              setRunning(!running);
            }}
          >
            {running ? t('voice.mic.stop') : t('voice.mic.start')}
          </Button>
        }
      >
        <div {...stylex.props(styles.meterLine)}>
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
          <span {...stylex.props(styles.readout)}>
            <span ref={readout}>{running ? '…' : t('voice.mic.idle')}</span>
            <span ref={speech} />
          </span>
        </div>
        {using === undefined ? null : (
          <Note tone="muted">{t('voice.mic.using', { name: using })}</Note>
        )}
        {problem === undefined ? null : (
          <Note tone="danger">
            {problem === 'denied' ? t('voice.mic.denied') : t('voice.mic.missing')}
          </Note>
        )}
      </SettingsRow>
      <SettingsRow
        title={t('voice.mic.threshold')}
        description={t('voice.mic.thresholdHint')}
        data={{ 'data-voice-speech-threshold': '' }}
        control={
          <Button
            variant="outline"
            size="sm"
            disabled={save === undefined || busy || (!threshold.custom && draft === undefined)}
            onClick={() => commit(null)}
          >
            {t('voice.mic.reset')}
          </Button>
        }
      >
        <div {...stylex.props(styles.meterLine)}>
          <input
            {...stylex.props(styles.range)}
            id="voice-speech-threshold"
            aria-label={t('voice.mic.threshold')}
            type="range"
            min={threshold.min}
            max={threshold.max}
            step={1}
            value={value}
            disabled={save === undefined || busy}
            onChange={(event) => setDraft(Number(event.currentTarget.value))}
            onPointerUp={release}
            onKeyUp={release}
            onBlur={release}
          />
          <span {...stylex.props(styles.readout)}>{t('voice.mic.dbfs', { value })}</span>
        </div>
        {error === undefined ? null : <Note tone="danger">{error}</Note>}
      </SettingsRow>
    </SettingsSection>
  );
}
