import { materialNavigationBar, navigationBar, space, type PlatformOS } from '../design/tokens';

const iosScales = [
  { scale: 0.823, caption: 11 },
  { scale: 0.882, caption: 11 },
  { scale: 0.941, caption: 11 },
  { scale: 1, caption: 11 },
  { scale: 1.118, caption: 13 },
  { scale: 1.235, caption: 15 },
  { scale: 1.353, caption: 17 },
  { scale: 1.786, caption: 20 },
  { scale: 2.143, caption: 24 },
  { scale: 2.643, caption: 29 },
  { scale: 3.143, caption: 34 },
  { scale: 3.571, caption: 40 },
] as const;

const latinGlyphs = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ';
const latinAdvances = [
  0.502, 0.554, 0.501, 0.554, 0.512, 0.304, 0.549, 0.539, 0.206, 0.205, 0.485, 0.204, 0.803, 0.527,
  0.531, 0.549, 0.549, 0.308, 0.465, 0.301, 0.527, 0.483, 0.715, 0.468, 0.486, 0.468, 0.635, 0.604,
  0.686, 0.679, 0.552, 0.528, 0.707, 0.699, 0.225, 0.495, 0.601, 0.524, 0.831, 0.699, 0.731, 0.578,
  0.731, 0.599, 0.593, 0.581, 0.696, 0.631, 0.924, 0.635, 0.612, 0.617, 0.205,
];

export function tabLabelFontSize(os: PlatformOS, fontScale: number): number {
  if (os === 'android') return materialNavigationBar.labelSize * fontScale;
  let nearest: (typeof iosScales)[number] = iosScales[0];
  for (const step of iosScales)
    if (Math.abs(step.scale - fontScale) < Math.abs(nearest.scale - fontScale)) nearest = step;
  return nearest.caption;
}

export function tabLabelWidth(label: string, size: number): number {
  const tracking = 1.025 + Math.max(0, 20 - size) * 0.011;
  const fullWidth = size >= 20 ? 0.95 : 0.995;
  let em = 0;
  for (const char of label) {
    const code = char.codePointAt(0) ?? 0;
    em +=
      code >= 0x2e80 ? fullWidth : (latinAdvances[latinGlyphs.indexOf(char)] ?? 0.62) * tracking;
  }
  return em * size;
}

export type TabIslandInput = {
  os: PlatformOS;
  labels: readonly string[];
  width: number;
  fontScale: number;
};

export type TabIslandLayout = { labels: boolean; labelSize: number };

function slot(os: PlatformOS, width: number, count: number): number {
  if (os === 'android') return width / count - materialNavigationBar.labelInset * 2;
  const island = width - space.x5 * 2 - space.x2 * 2 - space.x2 * (count - 1);
  return island / count - navigationBar.labelInset * 2;
}

export function tabIslandLayout({ os, labels, width, fontScale }: TabIslandInput): TabIslandLayout {
  const labelSize = tabLabelFontSize(os, fontScale);
  const widest = Math.max(0, ...labels.map((label) => tabLabelWidth(label, labelSize)));
  return { labels: widest <= slot(os, width, Math.max(1, labels.length)), labelSize };
}

export function iosTabIslandHeight(layout: TabIslandLayout): number {
  if (!layout.labels) return navigationBar.height;
  return Math.max(
    navigationBar.height,
    space.x2 * 2 +
      space.x1 * 3 +
      navigationBar.symbolBox +
      Math.ceil(layout.labelSize * navigationBar.labelLeading),
  );
}
