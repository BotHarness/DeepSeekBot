import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';

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
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return permission.granted ? undefined : 'denied';
}

export function useDictation(onText: (text: string) => void) {
  const current = useRef<Dictation>(idleDictation);
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
    const next = apply({ kind: 'heard', transcript: event.results[0]?.transcript ?? '' });
    if (next !== before) onText(next.heard);
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
          continuous: false,
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
