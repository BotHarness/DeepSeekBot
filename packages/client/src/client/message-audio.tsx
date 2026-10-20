import { useId, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  IconDownloadOutlineRegular,
  IconPauseOutlineRegular,
  IconPlayOutlineRegular,
  fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const PLAY_EVENT = 'bh-message-audio-play';
const SPECTRUM_BARS = 48;

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function spectrumBars(name: string, size: number): number[] {
  let seed = 2166136261;
  const key = `${name}:${size}`;
  for (let index = 0; index < key.length; index += 1) {
    seed ^= key.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  const bars: number[] = [];
  let state = seed >>> 0;
  for (let index = 0; index < SPECTRUM_BARS; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bars.push(0.2 + ((state % 100) / 100) * 0.8);
  }
  return bars;
}

export function MessageAudio({
  name,
  size,
  url,
  downloadUrl = url,
  onError,
  t,
}: {
  name: string;
  size?: number | undefined;
  url?: string | undefined;
  downloadUrl?: string | undefined;
  onError?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const instanceId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number>();
  const bars = useMemo(() => spectrumBars(name, size ?? 0), [name, size]);

  const pauseMount = useMountedResource<HTMLDivElement>(
    (node) => {
      const pauseOthers = (event: Event): void => {
        if (node.isConnected && (event as CustomEvent<string>).detail !== instanceId)
          audioRef.current?.pause();
      };
      window.addEventListener(PLAY_EVENT, pauseOthers);
      return () => window.removeEventListener(PLAY_EVENT, pauseOthers);
    },
    [instanceId],
  );

  const toggle = (): void => {
    const audio = audioRef.current;
    if (audio === null || url === undefined) return;
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent<string>(PLAY_EVENT, { detail: instanceId }));
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seek = (value: number): void => {
    const audio = audioRef.current;
    if (audio === null || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  const ready = url !== undefined && duration !== undefined && duration > 0;
  const seekFromClientX = (clientX: number): void => {
    const strip = spectrumRef.current;
    if (strip === null || !ready) return;
    const rect = strip.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(ratio * (duration ?? 0));
  };
  const stepSeek = (delta: number): void => {
    if (!ready) return;
    seek(Math.min(duration ?? 0, Math.max(0, current + delta)));
  };

  const progress = ready ? current / (duration ?? 1) : 0;

  return (
    <div className="bh-message-audio" ref={pauseMount}>
      <button
        type="button"
        className="bh-message-audio-play"
        aria-label={`${playing ? t('message.audio.pause') : t('message.audio.play')}: ${name}`}
        aria-pressed={playing}
        disabled={url === undefined}
        onClick={toggle}
      >
        {playing ? <IconPauseOutlineRegular size={16} /> : <IconPlayOutlineRegular size={16} />}
      </button>
      <span className="bh-message-file-copy">
        <span className="bh-message-file-name" title={name}>
          {name}
        </span>
        <span className="bh-message-audio-meta">
          <span>
            {formatAudioTime(current)} /{' '}
            {duration === undefined ? '--:--' : formatAudioTime(duration)}
          </span>
          {size === undefined ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span>{fileSizeText(size)}</span>
            </>
          )}
        </span>
        <div
          ref={spectrumRef}
          className="bh-message-audio-spectrum"
          role="slider"
          tabIndex={ready ? 0 : -1}
          aria-label={`${t('message.audio.seek')}: ${name}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration ?? 0)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatAudioTime(current)} / ${duration === undefined ? '--:--' : formatAudioTime(duration)}`}
          aria-disabled={!ready}
          onPointerDown={(event) => {
            if (!ready) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromClientX(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) seekFromClientX(event.clientX);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              stepSeek(-5);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              stepSeek(5);
            } else if (event.key === 'Home') {
              event.preventDefault();
              seek(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              if (duration !== undefined) seek(duration);
            }
          }}
        >
          {bars.map((height, index) => (
            <span
              key={index}
              className="bh-message-audio-bar"
              {...(index / bars.length <= progress ? { 'data-played': true } : {})}
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          ))}
        </div>
      </span>
      {downloadUrl === undefined ? null : (
        <>
          <span className="bh-message-file-divider" aria-hidden="true" />
          <Tooltip label={t('fileAction.download')} side="bottom" delayMs={500}>
            <a
              className="bh-message-file-download"
              href={downloadUrl}
              download={name}
              aria-label={`${t('fileAction.download')}: ${name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <IconDownloadOutlineRegular size={16} />
            </a>
          </Tooltip>
        </>
      )}
      {url === undefined ? null : (
        <audio
          ref={audioRef}
          className="bh-message-audio-element"
          src={url}
          preload="metadata"
          aria-label={`${t('message.audio.player')}: ${name}`}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={onError}
        />
      )}
    </div>
  );
}
