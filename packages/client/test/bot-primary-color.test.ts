import { describe, expect, it } from 'vitest';

import {
  botNameColor,
  contrastRatio,
  NAME_CONTRAST,
  parseColor,
  REFERENCE_SURFACES,
  toHex,
} from '../src/client/bot-primary-color.js';

const rgb = (value: string) => parseColor(value)!.rgb;
const SOURCES = {
  black: '#000000',
  white: '#ffffff',
  gray: '#9aa3ad',
  paleYellow: '#fff6b3',
  saturatedRed: '#ff0000',
  saturatedBlue: '#0000ff',
  saturatedGreen: '#00ff00',
  hairBrown: '#5a3a2a',
};
const BACKGROUNDS = [
  REFERENCE_SURFACES.light.background,
  REFERENCE_SURFACES.dark.background,
  '#f3f4f6',
  '#2a2b30',
  'rgb(250, 250, 252)',
  'rgba(21, 21, 23, 1)',
];

describe('Bot name color', () => {
  it('reaches 4.5:1 on light and dark surfaces for every kind of source', () => {
    for (const [name, source] of Object.entries(SOURCES))
      for (const background of BACKGROUNDS) {
        const color = botNameColor(source, background);
        expect(color, `${name} on ${background}`).toMatch(/^#[0-9a-f]{6}$/u);
        expect(
          contrastRatio(rgb(color), rgb(background)),
          `${name} on ${background} -> ${color}`,
        ).toBeGreaterThanOrEqual(NAME_CONTRAST);
      }
  });

  it('keeps a source that already reads', () => {
    expect(botNameColor('#5a3a2a', '#ffffff')).toBe('#5a3a2a');
    expect(botNameColor('#FFF6B3', '#151517')).toBe('#fff6b3');
    expect(botNameColor('#000000', '#ffffff')).toBe('#000000');
  });

  it('keeps black, white and gray monochrome instead of picking a hue', () => {
    for (const source of [SOURCES.black, SOURCES.white, '#9a9a9a', '#444444'])
      for (const background of BACKGROUNDS) {
        const [red, green, blue] = rgb(botNameColor(source, background));
        expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThanOrEqual(1);
      }
  });

  it('keeps the hue family of a chromatic source while changing its lightness', () => {
    const [red, green, blue] = rgb(botNameColor(SOURCES.paleYellow, '#ffffff'));
    expect(red).toBeGreaterThan(blue);
    expect(green).toBeGreaterThan(blue);
    const [r, g, b] = rgb(botNameColor(SOURCES.saturatedBlue, '#151517'));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it('derives different variants per theme from one unchanged source', () => {
    const source = SOURCES.gray;
    const light = botNameColor(source, REFERENCE_SURFACES.light.background);
    const dark = botNameColor(source, REFERENCE_SURFACES.dark.background);
    expect(light).not.toBe(dark);
    expect(source).toBe('#9aa3ad');
  });

  it('parses the colors a browser reports and leaves unreadable input alone', () => {
    expect(parseColor('rgba(0, 0, 0, 0)')).toEqual({ rgb: [0, 0, 0], alpha: 0 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ rgb: [10, 20, 30], alpha: 0.5 });
    expect(parseColor('color(srgb 1 0 0.2 / 0.14)')).toEqual({ rgb: [255, 0, 51], alpha: 0.14 });
    expect(parseColor('color(display-p3 1 0 0)')).toBeUndefined();
    expect(toHex([255, 0, 16])).toBe('#ff0010');
    expect(parseColor('transparent')).toBeUndefined();
    expect(botNameColor('#ff0000', 'transparent')).toBe('#ff0000');
  });
});
