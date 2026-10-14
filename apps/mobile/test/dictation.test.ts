import { describe, expect, it } from 'vitest';

import {
  composerActions,
  composerStacked,
  voiceDrag,
  voiceRelease,
  dictate,
  idleDictation,
  speechLang,
  type Dictation,
  type DictationEvent,
} from '../src/ui/chat/dictation';

const run = (...events: DictationEvent[]): Dictation => events.reduce(dictate, idleDictation);

describe('dictation states', () => {
  it('starts, listens, fills in what was heard and ends idle with the text kept', () => {
    expect(run({ kind: 'press' }).status).toBe('starting');
    expect(run({ kind: 'press' }, { kind: 'started' }).status).toBe('listening');
    const heard = run(
      { kind: 'press' },
      { kind: 'started' },
      { kind: 'heard', transcript: 'book a table ' },
    );
    expect(heard).toEqual({ status: 'listening', heard: 'book a table' });
    expect(dictate(heard, { kind: 'ended' })).toEqual({ status: 'idle', heard: 'book a table' });
  });

  it('treats a result before the start event as listening', () => {
    expect(run({ kind: 'press' }, { kind: 'heard', transcript: 'hi' }).status).toBe('listening');
  });

  it('refuses gracefully when permission is denied or recognition is unavailable', () => {
    expect(run({ kind: 'press' }, { kind: 'refused', reason: 'denied' }).status).toBe('denied');
    expect(run({ kind: 'press' }, { kind: 'refused', reason: 'unavailable' }).status).toBe(
      'unavailable',
    );
    expect(run({ kind: 'press' }, { kind: 'error', code: 'not-allowed' }).status).toBe('denied');
    expect(run({ kind: 'press' }, { kind: 'error', code: 'language-not-supported' }).status).toBe(
      'unavailable',
    );
  });

  it('goes quietly idle when nothing was said or the Human cancelled', () => {
    expect(run({ kind: 'press' }, { kind: 'error', code: 'no-speech' }).status).toBe('idle');
    expect(run({ kind: 'press' }, { kind: 'error', code: 'aborted' }).status).toBe('idle');
    expect(run({ kind: 'press' }, { kind: 'started' }, { kind: 'cancel' })).toEqual(idleDictation);
  });

  it('reports other errors as a failed dictation that a new press retries', () => {
    const failed = run({ kind: 'press' }, { kind: 'started' }, { kind: 'error', code: 'network' });
    expect(failed.status).toBe('failed');
    expect(dictate(failed, { kind: 'ended' }).status).toBe('failed');
    expect(dictate(failed, { kind: 'press' }).status).toBe('starting');
  });

  it('ignores events that arrive after dictation stopped', () => {
    const cancelled = run({ kind: 'press' }, { kind: 'cancel' });
    expect(dictate(cancelled, { kind: 'heard', transcript: 'late' })).toBe(cancelled);
    expect(dictate(cancelled, { kind: 'refused', reason: 'denied' })).toBe(cancelled);
    expect(dictate(cancelled, { kind: 'started' })).toBe(cancelled);
  });
});

describe('composer actions', () => {
  const base = {
    text: '',
    files: 0,
    disabled: false,
    dictation: 'idle',
    canDictate: true,
  } as const;

  it('shows the mic while the field is empty and Send once there is text', () => {
    expect(composerActions(base)).toEqual(['mic']);
    expect(composerActions({ ...base, text: '  ' })).toEqual(['mic']);
    expect(composerActions({ ...base, text: 'hello' })).toEqual(['send']);
  });

  it('keeps the mic next to Send when only files are attached', () => {
    expect(composerActions({ ...base, files: 2 })).toEqual(['mic', 'send']);
  });

  it('shows only Stop while dictating, even once words arrive', () => {
    expect(composerActions({ ...base, dictation: 'starting' })).toEqual(['stop']);
    expect(composerActions({ ...base, dictation: 'listening', text: 'hello' })).toEqual(['stop']);
  });

  it('offers the mic again after a refusal', () => {
    expect(composerActions({ ...base, dictation: 'denied' })).toEqual(['mic']);
  });

  it('hides the mic and Send while the conversation cannot send', () => {
    expect(composerActions({ ...base, disabled: true, text: 'hello' })).toEqual([]);
    expect(composerActions({ ...base, canDictate: false })).toEqual([]);
  });
});

describe('composer layout', () => {
  it('keeps one row for a single trailing button and stacks two rows otherwise', () => {
    expect(composerStacked(['mic'], 0, false)).toBe(false);
    expect(composerStacked(['send'], 0, false)).toBe(false);
    expect(composerStacked(['mic', 'send'], 1, false)).toBe(true);
    expect(composerStacked(['send'], 1, false)).toBe(true);
    expect(composerStacked(['stop'], 0, false)).toBe(false);
    expect(composerStacked(['send'], 0, true)).toBe(true);
  });
});

describe('mic gestures', () => {
  it('cancels on a slide left and locks on a slide up', () => {
    expect(voiceDrag(-20, -10)).toBeUndefined();
    expect(voiceDrag(-80, 0)).toBe('cancel');
    expect(voiceDrag(0, -60)).toBe('lock');
    expect(voiceDrag(-100, -100)).toBe('cancel');
  });

  it('stops on release after a hold and keeps listening after a tap', () => {
    expect(voiceRelease(120)).toBe('lock');
    expect(voiceRelease(300)).toBe('stop');
  });
});

describe('speech language', () => {
  it('maps the device locale onto a recognizer language', () => {
    expect(speechLang('zh-Hans-CN')).toBe('zh-CN');
    expect(speechLang('zh-Hant-TW')).toBe('zh-TW');
    expect(speechLang('zh-Hans')).toBe('zh-CN');
    expect(speechLang('en')).toBe('en-US');
    expect(speechLang('en-GB')).toBe('en-GB');
    expect(speechLang('ja_JP')).toBe('ja-JP');
    expect(speechLang('es-419')).toBe('es-419');
  });
});
