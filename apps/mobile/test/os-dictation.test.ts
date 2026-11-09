import { beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  os: 'ios' as 'ios' | 'android',
  available: true,
  granted: true,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return speech.os;
    },
  },
}));
vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => speech.available,
    getPermissionsAsync: () => Promise.resolve({ granted: speech.granted }),
    requestPermissionsAsync: () => Promise.resolve({ granted: speech.granted }),
    start: speech.start,
    stop: speech.stop,
    abort: speech.abort,
  },
}));

const { createComposerDictation } =
  await import('../../../packages/core/src/voice/dictation-client');
const { createOsRecognizer } = await import('../src/host/os-dictation');

const settle = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};
const result = (transcript: string, isFinal = false) => ({
  isFinal,
  results: [{ transcript }],
});

function dictation() {
  const recognizer = createOsRecognizer(() => 'en-US');
  const drafts: string[] = [];
  const controller = createComposerDictation({
    recognizer: () => recognizer,
    onText: (value) => drafts.push(value),
  });
  return { recognizer, controller, drafts };
}

beforeEach(() => {
  vi.clearAllMocks();
  speech.os = 'ios';
  speech.available = true;
  speech.granted = true;
});

describe('phone speech recognition behind the dictation controller (#3784)', () => {
  it('puts a space between the draft and what was heard: Book + a table', async () => {
    const { recognizer, controller, drafts } = dictation();
    controller.start('toggle', { before: 'Book', after: '' });
    await settle();
    expect(speech.start).toHaveBeenCalledOnce();
    recognizer.events.start();
    expect(controller.snapshot().status).toBe('listening');
    recognizer.events.result(result('a table', true));
    expect(drafts.at(-1)).toBe('Book a table');
    const stopped = controller.stop();
    expect(speech.stop).toHaveBeenCalledOnce();
    recognizer.events.end();
    expect(await stopped).toBe('a table');
    expect(controller.snapshot().status).toBe('idle');
  });

  it('joins CJK without a space and keeps the text after the caret tight', async () => {
    const { recognizer, controller, drafts } = dictation();
    controller.start('toggle', { before: '明天', after: 'Book' });
    await settle();
    recognizer.events.result(result('上海'));
    expect(drafts.at(-1)).toBe('明天上海Book');
  });

  it('appends Android final segments with the shared join', async () => {
    speech.os = 'android';
    const { recognizer, controller, drafts } = dictation();
    controller.start('toggle', { before: '', after: '' });
    await settle();
    recognizer.events.result(result('First sentence.', true));
    recognizer.events.result(result('Second', false));
    expect(drafts.at(-1)).toBe('First sentence. Second');
    recognizer.events.result(result('第二句', true));
    recognizer.events.result(result('第三句', false));
    expect(drafts.at(-1)).toBe('First sentence.第二句第三句');
  });

  it('restores the draft on cancel and aborts recognition', async () => {
    const { recognizer, controller, drafts } = dictation();
    controller.start('toggle', { before: 'keep ', after: '!' });
    await settle();
    recognizer.events.result(result('nope'));
    controller.cancel();
    expect(drafts.at(-1)).toBe('keep !');
    expect(speech.abort).toHaveBeenCalledOnce();
    recognizer.events.result(result('late'));
    expect(drafts.at(-1)).toBe('keep !');
  });

  it('reports denied, unavailable and failed recognition', async () => {
    speech.granted = false;
    let run = dictation();
    run.controller.start('toggle');
    await settle();
    expect(run.controller.snapshot().status).toBe('denied');
    speech.granted = true;
    speech.available = false;
    run = dictation();
    run.controller.start('toggle');
    await settle();
    expect(run.controller.snapshot().status).toBe('missing');
    speech.available = true;
    run = dictation();
    run.controller.start('toggle');
    await settle();
    run.recognizer.events.error({ error: 'network' });
    expect(run.controller.snapshot().status).toBe('failed');
    run = dictation();
    run.controller.start('toggle');
    await settle();
    run.recognizer.events.error({ error: 'no-speech' });
    expect(run.controller.snapshot().status).toBe('idle');
  });
});
