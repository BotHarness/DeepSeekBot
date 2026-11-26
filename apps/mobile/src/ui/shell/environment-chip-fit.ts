import { headerLabelScaleCeiling } from '../design/capped-text';
import { headerBarItem, space } from '../design/tokens';

export type EnvironmentChipSizes = {
  scale: number;
  icon: number;
  chevron: number;
  padding: number;
  minimumName: number;
};

export function environmentChipSizes(
  type: { title: { size: number; line: number }; body: { line: number } },
  fontScale: number,
  glass: boolean,
): EnvironmentChipSizes {
  const scale = Math.min(fontScale, headerLabelScaleCeiling);
  return {
    scale,
    icon: type.title.line * scale,
    chevron: type.body.line * scale,
    padding: glass ? space.x3 : 0,
    minimumName: type.title.size * scale * 2,
  };
}

export function nativeChipRoom(width: number, insets: { left: number; right: number }): number {
  return (
    width -
    insets.left -
    insets.right -
    headerBarItem.margin * 2 -
    (headerBarItem.size * 2 + space.x4) -
    space.x6 * 2
  );
}

export function environmentChipShowsName(room: number | undefined, sizes: EnvironmentChipSizes) {
  if (room === undefined) return true;
  const fixed = sizes.padding * 2 + sizes.icon + sizes.chevron + space.x2 * 2;
  return room - fixed >= sizes.minimumName;
}
