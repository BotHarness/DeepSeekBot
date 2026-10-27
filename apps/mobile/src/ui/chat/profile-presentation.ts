import type { DesignTheme } from '../design/theme';
import { sheetScreenOptions } from '../primitives/sheet-screen';

export function profileScreenOptions(theme: DesignTheme) {
  return { ...sheetScreenOptions(theme, true), gestureEnabled: true };
}
