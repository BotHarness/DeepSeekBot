import { androidSettings } from './tokens';

export function segmentCorners(first: boolean, last: boolean) {
  const top = first ? androidSettings.listRadius : androidSettings.innerRadius;
  const bottom = last ? androidSettings.listRadius : androidSettings.innerRadius;
  return {
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: bottom,
    borderBottomRightRadius: bottom,
  };
}
