import type { CallAudioRoute } from '../../host/call-audio-route';

export const CALL_AUDIO_SYMBOL: Record<
  CallAudioRoute,
  'speaker.wave.2.fill' | 'iphone' | 'music.note'
> = {
  speaker: 'speaker.wave.2.fill',
  receiver: 'iphone',
  media: 'music.note',
};
