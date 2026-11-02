import type { DesignTheme } from './resolve-theme';
import { readable as readableColor } from '../../../../../packages/client/src/client/bot-name-color';
import { distance, over, SEPARATION, tint, type LayerName } from './layers';

export const BUTTON_TONES = ['primary', 'secondary', 'tonal', 'danger'] as const;
export type ButtonTone = (typeof BUTTON_TONES)[number];

export type ButtonColors = {
  fill: string;
  pressed: string;
  label: string;
};

const LABEL_CONTRAST = 4.5;

const NEXT: Record<LayerName, LayerName> = {
  canvas: 'raised',
  raised: 'well',
  well: 'raised',
  field: 'raised',
  sheet: 'canvas',
};

function readable(paint: string, against: string): string {
  return readableColor(paint, against, LABEL_CONTRAST);
}

export function messageColors(theme: DesignTheme) {
  const background = theme.color.surface;
  return {
    link: readableColor(theme.color.accent, background, LABEL_CONTRAST),
    muted: readableColor(theme.color.muted, background, LABEL_CONTRAST),
    code: readableColor(theme.color.fg, theme.layer.raised.inset, LABEL_CONTRAST),
  };
}

export function buttonColors(theme: DesignTheme, tone: ButtonTone, on: LayerName): ButtonColors {
  const behind = theme.layer[on];
  if (tone === 'primary') {
    const fill = theme.color.fg;
    return {
      fill,
      pressed: tint(fill, behind.fill, 0.25),
      label: readable(theme.color.base, fill),
    };
  }
  if (tone === 'tonal') {
    const alternatives = [
      behind.fill,
      behind.danger,
      buttonColors(theme, 'secondary', on).fill,
      theme.color.fg,
    ];
    const fill =
      Array.from({ length: 21 }, (_, step) =>
        tint(behind.chosen, theme.color.accent, step / 20),
      ).find((candidate) =>
        alternatives.every((color) => distance(candidate, color) >= SEPARATION),
      ) ?? behind.chosen;
    return {
      fill,
      pressed: tint(fill, theme.color.fg, 0.16),
      label: readable(theme.color.accent, fill),
    };
  }
  if (tone === 'secondary') {
    const next = theme.layer[NEXT[on]];
    const fill =
      distance(behind.selected, behind.fill) >= SEPARATION ||
      distance(next.fill, behind.fill) < SEPARATION
        ? behind.selected
        : next.fill;
    return {
      fill,
      pressed: over(theme.color.hover, fill, 2),
      label: theme.color.fg,
    };
  }
  return {
    fill: behind.danger,
    pressed: over(theme.color.dangerSoft, behind.danger, 2),
    label: readable(theme.color.danger, behind.danger),
  };
}

export type SwitchColors = {
  trackOn: string;
  trackOff: string;
  thumb: string;
};

const THUMB = '#ffffff';

export function switchColors(theme: DesignTheme, on: LayerName): SwitchColors {
  return {
    trackOn: theme.color.accent,
    trackOff: theme.layer[on].selected,
    thumb: THUMB,
  };
}

export function settingsColors(theme: DesignTheme, on: LayerName) {
  return {
    heading: readable(theme.color.accent, theme.overlay.fill),
    selected: theme.layer[on].chosen,
    selectedText: readable(theme.color.accent, theme.layer[on].chosen),
  };
}
