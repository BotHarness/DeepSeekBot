import * as stylex from '@stylexjs/stylex';
import { space } from './ds/tokens.stylex.js';

export const savePresetStyles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  grow: { flexGrow: 1, minWidth: 0 },
});
