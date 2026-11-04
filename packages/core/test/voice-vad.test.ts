import { describe, expect, it } from 'vitest';

import { createVad, type VadEvent } from '../src/voice/vad.js';
import { chunks, concat, cough, knock, silence, speech } from './voice-audio-fixtures.js';

function run(audio: Int16Array, options?: Parameters<typeof createVad>[0]) {
  const vad = createVad(options);
  const events: VadEvent[] = [];
  for (const chunk of chunks(audio)) events.push(...vad.push(chunk));
  return events;
}

const kinds = (events: VadEvent[]) => events.map((event) => event.type);

describe('call VAD', () => {
  it('turns one spoken sentence into one utterance after the closing silence', () => {
    const events = run(concat(silence(500), speech(1600), silence(1000)));
    expect(kinds(events)).toEqual(['speech-start', 'utterance']);
    const utterance = events[1] as Extract<VadEvent, { type: 'utterance' }>;
    expect(utterance.startMs).toBeGreaterThanOrEqual(150);
    expect(utterance.startMs).toBeLessThanOrEqual(520);
    expect(utterance.endMs).toBeGreaterThanOrEqual(2050);
    expect(utterance.endMs).toBeLessThanOrEqual(2400);
    expect(utterance.voicedMs).toBeGreaterThan(1000);
    expect(utterance.pcm.length).toBe(((utterance.endMs - utterance.startMs) * 16_000) / 1000);
  });

  it('with short pauses, hands finished pieces over while the sentence goes on', () => {
    const options = { segmentSilenceMs: 250, endSilenceMs: 600, maxSegmentMs: 9_000 };
    const events = run(
      concat(silence(300), speech(1000), silence(350), speech(900, { seed: 4 }), silence(900)),
      options,
    );
    expect(kinds(events)).toEqual(['speech-start', 'segment', 'segment', 'utterance']);
    const first = events[1] as Extract<VadEvent, { type: 'segment' }>;
    const second = events[2] as Extract<VadEvent, { type: 'segment' }>;
    const utterance = events[3] as Extract<VadEvent, { type: 'utterance' }>;
    expect(first.forced).toBe(false);
    expect(first.endMs).toBeGreaterThan(1200);
    expect(first.endMs).toBeLessThan(1700);
    expect(second.startMs).toBe(first.endMs);
    expect(utterance.segmentedSamples).toBe(first.pcm.length + second.pcm.length);
    expect(utterance.pcm.length - utterance.segmentedSamples).toBeLessThan(3_200);
    const long = run(concat(speech(20_000, { dbfs: -6 }), silence(900)), options);
    expect(kinds(long)).toEqual(['speech-start', 'segment', 'segment', 'segment', 'utterance']);
    expect(long.filter((event) => event.type === 'segment' && event.forced)).toHaveLength(2);
    expect(kinds(run(concat(speech(1200), silence(900)), options))).toEqual([
      'speech-start',
      'segment',
      'utterance',
    ]);
  });

  it('keeps a short pause inside one sentence', () => {
    const events = run(concat(silence(300), speech(800), silence(400), speech(700), silence(1000)));
    expect(kinds(events)).toEqual(['speech-start', 'utterance']);
  });

  it('splits two sentences separated by a long pause', () => {
    const events = run(concat(speech(900), silence(1200), speech(900, { f0: 210 }), silence(900)));
    expect(kinds(events)).toEqual(['speech-start', 'utterance', 'speech-start', 'utterance']);
  });

  it('does not start a sentence for a cough', () => {
    const events = run(concat(silence(500), cough(350), silence(1000)));
    expect(kinds(events)).not.toContain('speech-start');
    expect(kinds(events)).not.toContain('utterance');
    expect(kinds(events)).toContain('noise');
  });

  it('does not start a sentence for repeated coughs or knocks', () => {
    const events = run(
      concat(
        silence(400),
        cough(300, { seed: 5 }),
        silence(150),
        cough(400, { seed: 9 }),
        silence(600),
        knock(),
        silence(300),
        knock(),
        silence(900),
      ),
    );
    expect(kinds(events)).not.toContain('speech-start');
    expect(kinds(events)).not.toContain('utterance');
  });

  it('still hears a sentence that follows a cough', () => {
    const events = run(concat(silence(300), cough(300), silence(500), speech(1200), silence(900)));
    expect(kinds(events).filter((kind) => kind !== 'noise')).toEqual(['speech-start', 'utterance']);
  });

  it('adapts to steady background noise', () => {
    const events = run(
      concat(
        silence(2000, { dbfs: -40 }),
        speech(1200, { dbfs: -14 }),
        silence(1000, { dbfs: -40 }),
      ),
    );
    expect(kinds(events).filter((kind) => kind !== 'noise')).toEqual(['speech-start', 'utterance']);
    expect(kinds(events).filter((kind) => kind === 'noise').length).toBeLessThanOrEqual(1);
  });

  it('keeps a long sentence whole', () => {
    const events = run(concat(silence(300), speech(8000), silence(900)));
    expect(kinds(events)).toEqual(['speech-start', 'utterance']);
  });

  it('cuts a sentence that runs past the limit', () => {
    const events = run(concat(speech(2600), silence(800)), { maxUtteranceMs: 1000 });
    const cut = events.find((event) => event.type === 'utterance');
    expect(cut).toMatchObject({ cut: true });
  });

  it('reset drops a sentence in progress', () => {
    const vad = createVad();
    for (const chunk of chunks(concat(silence(200), speech(800)))) vad.push(chunk);
    expect(vad.speaking).toBe(true);
    vad.reset();
    expect(vad.speaking).toBe(false);
    const events: VadEvent[] = [];
    for (const chunk of chunks(silence(1500))) events.push(...vad.push(chunk));
    expect(events).toEqual([]);
  });
});
