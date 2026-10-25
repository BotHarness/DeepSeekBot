import { materialSearch } from './tokens';

export function materialSearchHeight(fontScale: number): number {
  return materialSearch.height + materialSearch.lineHeight * Math.max(0, fontScale - 1);
}
