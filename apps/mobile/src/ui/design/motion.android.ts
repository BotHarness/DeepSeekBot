import { decelerate } from './tokens';
import { platformSprings } from './motion-springs';

export { springy } from './motion-springs';

export const spring = platformSprings('android');

export const decelerateCurve = decelerate.android;
