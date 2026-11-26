import type { ReactElement } from 'react';

import type { ImageProps } from '@expo/ui/swift-ui';
import type { SymbolViewProps } from 'expo-symbols';

import type { LayerName } from '../design/layers';

export type TabOrderItem = {
  key: string;
  label: string;
  symbol: { ios: NonNullable<ImageProps['systemName']>; android: AndroidSymbol };
  avatar?: ReactElement | undefined;
};

type AndroidSymbol = Extract<SymbolViewProps['name'], { android?: unknown }>['android'] & string;

export type TabOrderCopy = {
  moveUp(name: string): string;
  moveDown(name: string): string;
  position(index: number, count: number): string;
};

export type TabOrderListProps = {
  title: string;
  footer?: string | undefined;
  items: readonly TabOrderItem[];
  on?: LayerName;
  copy: TabOrderCopy;
  onMove(from: number, destination: number): void;
};

export function dropIndex(heights: readonly number[], from: number, translation: number): number {
  'worklet';
  const start = heights.slice(0, from).reduce((sum, height) => sum + height, 0);
  const center = start + (heights[from] ?? 0) / 2 + translation;
  let top = 0;
  for (let index = 0; index < heights.length; index++) {
    const height = heights[index] ?? 0;
    if (center < top + height / 2) return index;
    top += height;
  }
  return heights.length;
}
