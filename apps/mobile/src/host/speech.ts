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
import {
  createComposerDictation,
  type ComposerDictation,
  type ComposerDictationStatus,
} from '../../../../packages/core/src/voice/dictation-client';
import type { HostClient } from './client';
import { createDictationMic } from './dictation-mic';
import { createHostDictationPort, hostDictationReady } from './host-dictation';

export type DictationProblem = 'denied' | 'unavailable' | 'failed';

function problemOf(status: Dictation['status']): DictationProblem | undefined {
  return status === 'denied' || status === 'unavailable' || status === 'failed'
    ? status
    : undefined;
}

function hostStatus(status: ComposerDictationStatus): Dictation['status'] {
  if (status === 'finishing') return 'listening';
  if (status === 'limited') return 'idle';
  if (status === 'missing') return 'unavailable';
  return status;
}

async function permitted(): Promise<'denied' | 'unavailable' | undefined> {
  if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return 'unavailable';
  const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
  if (current.granted) return undefined;
  const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return permission.granted ? undefined : 'denied';
}

export function useDictation(
  onText: (text: string, caret?: number) => void,
  options: {
    client?: HostClient | undefined;
    slug?: string | undefined;
    onProblem?(problem: DictationProblem): void;
  } = {},
) {
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<Dictation>(idleDictation);
  const hosted = useRef<ComposerDictation | undefined>(undefined);
  const finalized = useRef('');
  const insertion = useRef({ before: '', after: '' });
  const [state, setState] = useState(idleDictation);
  const apply = (event: DictationEvent) => {
    return settle(dictate(current.current, event));
  };
  const settle = (next: Dictation) => {
    const was = current.current.status;
    current.current = next;
    setState(next);
    const problem = problemOf(next.status);
    if (problem !== undefined && next.status !== was) latest.current.onProblem?.(problem);
    return next;
  };
  const splice = (heard: string) => {
    const { before, after } = insertion.current;
    onText(before + heard + after, before.length + heard.length);
  };

  useSpeechRecognitionEvent('start', () => {
    if (hosted.current === undefined) apply({ kind: 'started' });
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (hosted.current !== undefined) return;
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
      splice(next.heard);
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (hosted.current === undefined) apply({ kind: 'error', code: event.error });
  });
  useSpeechRecognitionEvent('end', () => {
    if (hosted.current === undefined) apply({ kind: 'ended' });
  });

  const mountRef = useMounted<unknown>(
    () => () => {
      const host = hosted.current;
      hosted.current = undefined;
      if (host !== undefined) host.dispose();
      else if (dictating(current.current.status)) ExpoSpeechRecognitionModule.abort();
      current.current = idleDictation;
    },
    [],
  );

  const start = (draft?: { text: string; caret?: number }) => {
    if (dictating(current.current.status)) return;
    const text = draft?.text ?? '';
    const caret = Math.max(0, Math.min(text.length, draft?.caret ?? text.length));
    insertion.current = { before: text.slice(0, caret), after: text.slice(caret) };
    finalized.current = '';
    apply({ kind: 'press' });
    const { client, slug } = latest.current;
    hostDictationReady(client, slug)
      .then(async (ready) => {
        if (current.current.status !== 'starting') return;
        if (ready && client !== undefined) {
          startHosted(client, slug);
          return;
        }
        const refusal = await permitted();
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

  const startHosted = (client: HostClient, slug: string | undefined) => {
    const controller = createComposerDictation({
      port: createHostDictationPort(client, slug),
      mic: createDictationMic(),
      onText: (heard) => {
        if (hosted.current === controller) splice(heard.trim());
      },
    });
    hosted.current = controller;
    controller.subscribe(() => {
      if (hosted.current !== controller) return;
      const snapshot = controller.snapshot();
      const status = hostStatus(snapshot.status);
      if (!dictating(status)) hosted.current = undefined;
      if (status !== current.current.status)
        settle({ status, heard: snapshot.text.trim() || current.current.heard });
    });
    controller.start('toggle');
  };

  const stop = () => {
    const host = hosted.current;
    if (host !== undefined) {
      if (current.current.status === 'listening') void host.stop();
      else cancel();
      return;
    }
    if (current.current.status === 'listening') ExpoSpeechRecognitionModule.stop();
    else cancel();
  };

  const cancel = () => {
    const was = current.current.status;
    const host = hosted.current;
    hosted.current = undefined;
    if (host !== undefined) {
      host.dispose();
      settle(idleDictation);
      if (dictating(was))
        onText(insertion.current.before + insertion.current.after, insertion.current.before.length);
      return;
    }
    apply({ kind: 'cancel' });
    if (dictating(was)) {
      ExpoSpeechRecognitionModule.abort();
      onText(insertion.current.before + insertion.current.after, insertion.current.before.length);
    }
  };

  return { state, start, stop, cancel, mountRef };
}
