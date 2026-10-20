import { describe, expect, it } from 'vitest';
import { NOTICE_DURATION, NOTICE_GLANCE, noticeFrame } from '../src/client/notice.js';

describe('inbox notice timeline', () => {
  it('lights the phone, pops an envelope out of it, shows the alert and glances, then clears', () => {
    expect(noticeFrame(0.05).buzz).not.toBe(0);
    const rising = noticeFrame(0.4);
    expect(rising).toMatchObject({ phone: 1, envelope: 1, alert: 0, glance: 1 });
    expect(rising.rise).toBeGreaterThan(0);
    expect(rising.rise).toBeLessThan(1);
    expect(noticeFrame(1.5)).toMatchObject({ envelope: 1, rise: 1, alert: 1 });
    expect(noticeFrame(NOTICE_GLANCE).glance).toBe(0);
    expect(noticeFrame(2.5).envelope).toBe(0);
    expect(noticeFrame(2.7).alert).toBe(0);
    expect(noticeFrame(NOTICE_DURATION)).toEqual({
      phone: 0,
      buzz: 0,
      alert: 0,
      pop: 0,
      envelope: 0,
      rise: 0,
      glance: 0,
    });
  });

  it('keeps reduced motion still', () => {
    expect(noticeFrame(1, true)).toMatchObject({
      buzz: 0,
      envelope: 1,
      rise: 1,
      pop: 1,
      alert: 1,
      phone: 1,
      glance: 1,
    });
  });
});
