import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { MessageVoice } from '../../host/conversation';
import { tint } from '../design/layers';
import { radius, space, voiceRow } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { PauseIcon, PlayIcon } from '../shell/icons';
import { useStrings } from '../strings';

const BARS = 28;

export function voiceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function voiceBars(key: string): number[] {
  let state = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    state ^= key.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  const bars: number[] = [];
  for (let index = 0; index < BARS; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bars.push(0.25 + ((state % 100) / 100) * 0.75);
  }
  return bars;
}

let silentModeReady: Promise<void> | undefined;

export function VoiceBar({ voice, human = false }: { voice: MessageVoice; human?: boolean }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);
  const audio = voice.audio;
  if (audio === undefined || voice.state !== 'ready')
    return (
      <Text variant="meta" tone="muted" accessibilityRole="text">
        {voice.state === 'failed' ? t.voiceFailed(voice.error) : t.voicePending}
      </Text>
    );
  const toggle = async (): Promise<void> => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (!loaded.current) {
      setLoading(true);
      setFailed(false);
      try {
        silentModeReady ??= setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
        await silentModeReady;
        const { cachedAttachmentUri } = await import('../../host/share-attachment');
        player.replace({ uri: await cachedAttachmentUri(audio, { reuse: true }) });
        loaded.current = true;
      } catch {
        setFailed(true);
        return;
      } finally {
        setLoading(false);
      }
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration))
      await player.seekTo(0);
    player.play();
  };
  const duration =
    status.duration > 0
      ? status.duration
      : voice.durationMs === undefined
        ? undefined
        : voice.durationMs / 1000;
  const progress = duration === undefined ? 0 : Math.min(1, status.currentTime / duration);
  const bars = voiceBars(audio.key);
  const label = status.playing ? t.pauseVoice : t.playVoice;
  const ink = human ? theme.color.onAccent : theme.color.accent;
  const glyph = human ? theme.color.accent : theme.color.onAccent;
  const background = human ? theme.color.accent : theme.color.surface;
  const played = human ? theme.color.onAccent : theme.color.accent;
  const unplayed = tint(
    background,
    human ? theme.color.onAccent : theme.color.fg,
    voiceRow.unplayed,
  );
  const elapsed = voiceTime(status.currentTime);
  return (
    <Pressable
      testID="voice-bar"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: audio.source === undefined }}
      accessibilityValue={
        duration === undefined ? undefined : { text: `${elapsed} / ${voiceTime(duration)}` }
      }
      disabled={loading || audio.source === undefined}
      onPress={() => void toggle()}
      style={{
        minHeight: theme.touch,
        minWidth: theme.touch * 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
      }}
    >
      <View
        style={{
          width: voiceRow.play,
          height: voiceRow.play,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ink,
        }}
      >
        {loading ? (
          <LoadingIndicator size="control" color={glyph} />
        ) : status.playing ? (
          <PauseIcon color={glyph} size={theme.type.meta.line} />
        ) : (
          <PlayIcon color={glyph} size={theme.type.meta.line} />
        )}
      </View>
      <View style={{ flex: 1, gap: space.x1 }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x1,
            height: voiceRow.wave,
          }}
        >
          {bars.map((height, index) => (
            <View
              key={index}
              style={{
                width: voiceRow.bar,
                height: `${Math.round(height * 100)}%`,
                borderRadius: radius.round,
                backgroundColor: index / bars.length < progress ? played : unplayed,
              }}
            />
          ))}
        </View>
        <Text
          testID="voice-time"
          variant="meta"
          tone={failed ? 'danger' : human ? 'onAccent' : 'muted'}
          numberOfLines={1}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {failed
            ? t.voiceUnavailable
            : duration === undefined
              ? elapsed
              : `${elapsed} / ${voiceTime(duration)}`}
        </Text>
      </View>
    </Pressable>
  );
}
