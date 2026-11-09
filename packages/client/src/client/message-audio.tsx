import { useId, useMemo, useRef, useState, type ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const PLAY_EVENT = 'bh-message-audio-play';
const SPECTRUM_BARS = 32;

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function spectrumBars(key: string): number[] {
  let seed = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    seed ^= key.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  const bars: number[] = [];
  let state = seed >>> 0;
  for (let index = 0; index < SPECTRUM_BARS; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bars.push(0.25 + ((state % 100) / 100) * 0.75);
  }
  return bars;
}

export function MessageAudio({
  name,
  seed = name,
  durationMs,
  url,
  onPrepare,
  onError,
  t,
}: {
  name: string;
  seed?: string | undefined;
  durationMs?: number | undefined;
  url?: string | undefined;
  onPrepare?: (() => Promise<string | undefined>) | undefined;
  onError?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const instanceId = useId();
  const preparing = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [measured, setDuration] = useState<number>();
  const duration =
    measured !== undefined && Number.isFinite(measured) && measured > 0
      ? measured
      : durationMs === undefined
        ? undefined
        : durationMs / 1000;
  const bars = useMemo(() => spectrumBars(seed), [seed]);

  const pauseMount = useMountedResource<HTMLDivElement>(
    (node) => {
      const pauseOthers = (event: Event): void => {
        if (node.isConnected && (event as CustomEvent<string>).detail !== instanceId)
          audioRef.current?.pause();
      };
      window.addEventListener(PLAY_EVENT, pauseOthers);
      return () => {
        window.removeEventListener(PLAY_EVENT, pauseOthers);
        if (onPrepare !== undefined) node.querySelector('audio')?.pause();
      };
    },
    [instanceId, onPrepare],
  );

  const toggle = async (): Promise<void> => {
    const audio = audioRef.current;
    if (audio === null || preparing.current) return;
    if (url === undefined) {
      if (onPrepare === undefined) return;
      preparing.current = true;
      try {
        const prepared = await onPrepare();
        if (prepared === undefined || !audio.isConnected || audioRef.current !== audio) return;
        audio.src = prepared;
      } finally {
        preparing.current = false;
      }
    }
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

  const total = duration === undefined ? '--:--' : formatAudioTime(duration);
  return (
    <div className="bh-message-audio" ref={pauseMount} data-playing={playing ? '' : undefined}>
      <button
        type="button"
        className="bh-message-audio-play"
        aria-label={`${playing ? t('message.audio.pause') : t('message.audio.play')}: ${name}`}
        aria-pressed={playing}
        disabled={url === undefined && onPrepare === undefined}
        onClick={() => void toggle()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d={
              playing
                ? 'M4 2.5h3v11H4zM9 2.5h3v11H9z'
                : 'M5 2.6v10.8a.6.6 0 0 0 .9.5l8.4-5.4a.6.6 0 0 0 0-1L5.9 2.1a.6.6 0 0 0-.9.5z'
            }
          />
        </svg>
      </button>
      <span className="bh-message-audio-track">
        <div
          ref={spectrumRef}
          className="bh-message-audio-spectrum"
          role="slider"
          tabIndex={ready ? 0 : -1}
          aria-label={`${t('message.audio.seek')}: ${name}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration ?? 0)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatAudioTime(current)} / ${total}`}
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
              {...(index / bars.length < progress ? { 'data-played': true } : {})}
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          ))}
        </div>
        <span className="bh-message-audio-meta">
          {formatAudioTime(current)} / {total}
        </span>
      </span>
      {url === undefined && onPrepare === undefined ? null : (
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
