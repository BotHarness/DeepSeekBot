import { materialSearch, searchAppBar } from './tokens';

export function materialSearchHeight(fontScale: number): number {
  return materialSearch.height + materialSearch.lineHeight * Math.max(0, fontScale - 1);
}

export function searchAppBarHeight(fontScale: number): number {
  return materialSearchHeight(fontScale) + searchAppBar.verticalPadding * 2;
}
