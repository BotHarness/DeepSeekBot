import type { TextProps } from 'react-native';

export function textRamp(size = 17): TextProps['dynamicTypeRamp'] {
  if (size <= 11) return 'caption2';
  if (size <= 12) return 'caption1';
  if (size <= 13) return 'footnote';
  if (size <= 15) return 'subheadline';
  if (size <= 17) return 'body';
  if (size <= 20) return 'title3';
  if (size <= 22) return 'title2';
  if (size <= 28) return 'title1';
  return 'largeTitle';
}

export const variantRamp = {
  meta: 'footnote',
  body: 'body',
  title: 'headline',
  display: 'title1',
} as const;
