import { describe, expect, it } from 'vitest';

import {
  composerActions,
  composerFieldHeight,
  composerStacked,
  voiceDrag,
  voiceRelease,
  speechLang,
} from '../src/ui/chat/dictation';

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

  it('keeps composer action positions while unavailable', () => {
    expect(composerActions({ ...base, disabled: true, text: 'hello' })).toEqual(['send']);
    expect(composerActions({ ...base, disabled: true, files: 1, keepDisabledMic: true })).toEqual([
      'mic',
      'send',
    ]);
    expect(composerActions({ ...base, disabled: true, keepDisabledMic: true })).toEqual(['mic']);
    expect(composerActions({ ...base, canDictate: false })).toEqual([]);
    expect(composerActions({ ...base, disabled: true })).toEqual([]);
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

describe('composer height', () => {
  it('reserves room for the conversation and actions at accessibility sizes without clipping a line', () => {
    expect(composerFieldHeight(400, 64, 5, 175)).toBe(175);
    expect(composerFieldHeight(400, 64, 5, 50)).toBe(74);
  });
  it('grows one line at a time up to five lines, then holds and scrolls', () => {
    const line = 22;
    const padding = 5;
    expect(composerFieldHeight(0, line, padding)).toBe(32);
    expect(composerFieldHeight(2 * line + 2 * padding, line, padding)).toBe(54);
    expect(composerFieldHeight(5 * line + 2 * padding, line, padding)).toBe(120);
    expect(composerFieldHeight(9 * line + 2 * padding, line, padding)).toBe(120);
  });
});
