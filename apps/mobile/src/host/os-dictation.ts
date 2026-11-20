import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { AppState, Platform } from 'react-native';

import {
  DictationMicError,
  withDictation,
  type DictationProblem,
  type DictationRecognizer,
  type DictationRecognizerEvents,
} from '../../../../packages/core/src/voice/dictation-client';
import { speechLang } from '../ui/chat/dictation';

export interface OsSpeechEvents {
  start(): void;
  result(event: { isFinal?: boolean; results: readonly { transcript: string }[] }): void;
  error(event: { error: string }): void;
  end(): void;
}

export interface OsRecognizer extends DictationRecognizer {
  readonly events: OsSpeechEvents;
}

const QUIET = new Set(['aborted', 'no-speech', 'speech-timeout']);

function problemOf(code: string): DictationProblem {
  if (code === 'not-allowed') return 'denied';
  if (code === 'service-not-allowed' || code === 'language-not-supported') return 'missing';
  return 'failed';
}

async function permitted(): Promise<boolean> {
  if (!ExpoSpeechRecognitionModule.isRecognitionAvailable())
    throw new DictationMicError('microphone-missing');
  if ((await ExpoSpeechRecognitionModule.getPermissionsAsync()).granted) return false;
  if (!(await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted)
    throw new DictationMicError('microphone-denied');
  return true;
}

function foreground(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      subscription.remove();
      resolve();
    });
  });
}

export function createOsRecognizer(
  locale: () => string = () => Intl.DateTimeFormat().resolvedOptions().locale,
): OsRecognizer {
  let listener: DictationRecognizerEvents | undefined;
  let started = false;
  let done = false;
  let finalized = '';
  let finishing: { resolve(): void; reject(error: Error): void } | undefined;
  const end = () => {
    if (done) return;
    done = true;
    if (finishing !== undefined) finishing.resolve();
    else listener?.end();
  };
  return {
    events: {
      start() {
        if (!done) listener?.listening();
      },
      result(event) {
        if (done) return;
        const text = event.results[0]?.transcript.trim() ?? '';
        const transcript = Platform.OS === 'android' ? withDictation(finalized, text) : text;
        if (Platform.OS === 'android' && event.isFinal === true) finalized = transcript;
        listener?.listening();
        listener?.text(transcript);
      },
      error(event) {
        if (done) return;
        if (QUIET.has(event.error)) {
          end();
          return;
        }
        done = true;
        if (finishing !== undefined) finishing.reject(new Error(event.error));
        else listener?.fail(problemOf(event.error));
      },
      end,
    },
    async start(events) {
      listener = events;
      if (await permitted()) await foreground();
      if (done) return;
      started = true;
      ExpoSpeechRecognitionModule.start({
        lang: speechLang(locale()),
        interimResults: true,
        addsPunctuation: true,
        continuous: true,
      });
    },
    finish() {
      if (done || !started) return Promise.resolve(undefined);
      const settled = new Promise<undefined>((resolve, reject) => {
        finishing = { resolve: () => resolve(undefined), reject };
      });
      ExpoSpeechRecognitionModule.stop();
      return settled;
    },
    cancel() {
      if (done) return;
      done = true;
      ExpoSpeechRecognitionModule.abort();
    },
  };
}
