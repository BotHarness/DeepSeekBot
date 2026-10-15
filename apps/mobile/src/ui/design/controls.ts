import { contrast, type DesignTheme } from './resolve-theme';
import { distance, over, SEPARATION, tint, type LayerName } from './layers';

export const BUTTON_TONES = ['primary', 'secondary', 'danger'] as const;
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

function readable(paint: string, against: string, toward: string): string {
  let amount = 0;
  let next = paint;
  while (contrast(next, against) < LABEL_CONTRAST && amount < 1) {
    amount += 0.02;
    next = tint(paint, toward, amount);
  }
  return next;
}

export function buttonColors(theme: DesignTheme, tone: ButtonTone, on: LayerName): ButtonColors {
  const behind = theme.layer[on];
  if (tone === 'primary') {
    const fill = theme.color.fg;
    return {
      fill,
      pressed: tint(fill, behind.fill, 0.25),
      label: readable(theme.color.base, fill, behind.fill),
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
    label: readable(theme.color.danger, behind.danger, theme.color.fg),
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
