import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState, useSyncExternalStore } from 'react';

import { useMounted } from '../ui/mounted';
import {
  createComposerDictation,
  createHostRecognizer,
  createVoiceDictationPort,
  type ComposerDictation,
  type ComposerDictationStatus,
} from '../../../../packages/core/src/voice/dictation-client';
import type { HostClient } from './client';
import { createDictationMic } from './dictation-mic';
import { hostDictationReady } from './host-dictation';
import { createOsRecognizer, type OsRecognizer } from './os-dictation';

export type DictationProblem = 'denied' | 'unavailable' | 'failed' | 'limited';

const PROBLEMS: Partial<Record<ComposerDictationStatus, DictationProblem>> = {
  denied: 'denied',
  missing: 'unavailable',
  failed: 'failed',
  limited: 'limited',
};

export function useDictation(
  onText: (text: string, caret?: number) => void,
  options: {
    client?: HostClient | undefined;
    slug?: string | undefined;
    onProblem?(problem: DictationProblem): void;
  } = {},
) {
  const latest = useRef({ onText, options });
  latest.current = { onText, options };
  const os = useRef<OsRecognizer | undefined>(undefined);
  const [controller] = useState<ComposerDictation>(() => {
    const created = createComposerDictation({
      recognizer: async () => {
        const { client, slug } = latest.current.options;
        if (client !== undefined && (await hostDictationReady(client, slug)))
          return createHostRecognizer({
            port: createVoiceDictationPort((method, args) => client.call(method, args), { slug }),
            mic: createDictationMic(),
          });
        const recognizer = createOsRecognizer();
        os.current = recognizer;
        return recognizer;
      },
      onText: (text, caret) => latest.current.onText(text, caret),
    });
    let was = created.snapshot().status;
    created.subscribe(() => {
      const status = created.snapshot().status;
      if (status === was) return;
      was = status;
      const problem = PROBLEMS[status];
      if (problem !== undefined) latest.current.options.onProblem?.(problem);
    });
    return created;
  });
  const snapshot = useSyncExternalStore(controller.subscribe, controller.snapshot);

  useSpeechRecognitionEvent('start', () => os.current?.events.start());
  useSpeechRecognitionEvent('result', (event) => os.current?.events.result(event));
  useSpeechRecognitionEvent('error', (event) => os.current?.events.error(event));
  useSpeechRecognitionEvent('end', () => os.current?.events.end());

  const mountRef = useMounted<unknown>(() => () => controller.dispose(), [controller]);

  const start = (draft?: { text: string; caret?: number }) => {
    const text = draft?.text ?? '';
    const caret = Math.max(0, Math.min(text.length, draft?.caret ?? text.length));
    controller.start('toggle', { before: text.slice(0, caret), after: text.slice(caret) });
  };

  return {
    state: { status: snapshot.status, heard: snapshot.text },
    start,
    stop: () => void controller.stop(),
    cancel: () => controller.cancel(),
    mountRef,
  };
}
