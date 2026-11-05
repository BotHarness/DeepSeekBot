import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  dictate,
  dictating,
  idleDictation,
  speechLang,
  type Dictation,
  type DictationEvent,
} from '../ui/chat/dictation';
import { useMounted } from '../ui/mounted';

async function permitted(): Promise<'denied' | 'unavailable' | undefined> {
  if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return 'unavailable';
  const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
  if (current.granted) return undefined;
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return permission.granted ? undefined : 'denied';
}

export function useDictation(onText: (text: string) => void) {
  const current = useRef<Dictation>(idleDictation);
  const finalized = useRef('');
  const [state, setState] = useState(idleDictation);
  const apply = (event: DictationEvent) => {
    const next = dictate(current.current, event);
    current.current = next;
    setState(next);
    return next;
  };

  useSpeechRecognitionEvent('start', () => apply({ kind: 'started' }));
  useSpeechRecognitionEvent('result', (event) => {
    const before = current.current;
    const text = event.results[0]?.transcript.trim() ?? '';
    const transcript =
      Platform.OS === 'android'
        ? [finalized.current, text]
            .filter((part) => part !== '')
            .join(/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? '' : ' ')
        : text;
    const next = apply({ kind: 'heard', transcript });
    if (next !== before) {
      if (Platform.OS === 'android' && event.isFinal) finalized.current = next.heard;
      onText(next.heard);
    }
  });
  useSpeechRecognitionEvent('error', (event) => apply({ kind: 'error', code: event.error }));
  useSpeechRecognitionEvent('end', () => apply({ kind: 'ended' }));

  const mountRef = useMounted<unknown>(
    () => () => {
      if (dictating(current.current.status)) ExpoSpeechRecognitionModule.abort();
      current.current = idleDictation;
    },
    [],
  );

  const start = () => {
    if (dictating(current.current.status)) return;
    finalized.current = '';
    apply({ kind: 'press' });
    permitted()
      .then((refusal) => {
        if (current.current.status !== 'starting') return;
        if (refusal !== undefined) {
          apply({ kind: 'refused', reason: refusal });
          return;
        }
        ExpoSpeechRecognitionModule.start({
          lang: speechLang(Intl.DateTimeFormat().resolvedOptions().locale),
          interimResults: true,
          addsPunctuation: true,
          continuous: true,
        });
      })
      .catch(() => apply({ kind: 'refused', reason: 'unavailable' }));
  };

  const stop = () => {
    if (current.current.status === 'listening') ExpoSpeechRecognitionModule.stop();
    else cancel();
  };

  const cancel = () => {
    const was = current.current.status;
    apply({ kind: 'cancel' });
    if (dictating(was)) {
      ExpoSpeechRecognitionModule.abort();
      onText('');
    }
  };

  return { state, start, stop, cancel, mountRef };
}
